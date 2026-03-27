import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SummaryCard from './components/SummaryCard';
import BookingTableRow from './components/BookingTableRow';
import UpcomingDeliveryCard from './components/UpcomingDeliveryCard';
import UpcomingPickupCard from './components/UpcomingPickupCard';
import RecentActivityItem from './components/RecentActivityItem';
import QuickActionButton from './components/QuickActionButton';
import { formatRs } from '../../utils/format';
import ChatModal from '../../components/ui/ChatModal';
import RatingModal from '../../components/ui/RatingModal';
import { addInAppNotification, buildNotificationContext } from '../../utils/notifications';
import { CHAT_LEG_GENERAL, readSeenMessageId, writeSeenMessageId } from '../../utils/chatAccess';

const BOOKINGS_PAGE_SIZE = 10;
const DASHBOARD_POLL_MS = 10000;
const CHAT_NOTIFICATION_POLL_MS = 5000;
const CUSTOMER_CHAT_NOTIFICATION_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'in_transit_to_origin_branch',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);
const CUSTOMER_STATUS_NOTIFICATION_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'linehaul_assigned',
  'linehaul_in_transit',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery',
  'delivery_attempt_failed',
  'waiting_for_reattempt',
  'rts_pending',
  'returned_to_sender',
  'delivered',
  'cancelled'
]);
const getCustomerStatusNotificationSeedKey = (userId) => `__cf_customer_status_seeded_${Number(userId) || 0}`;
const hasCustomerStatusNotificationsSeeded = (userId) => {
  if (typeof window === 'undefined') {
    return false;
  }
  const key = getCustomerStatusNotificationSeedKey(userId);
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch (error) {
    return false;
  }
};
const markCustomerStatusNotificationsSeeded = (userId) => {
  if (typeof window === 'undefined') {
    return;
  }
  const key = getCustomerStatusNotificationSeedKey(userId);
  try {
    window.sessionStorage.setItem(key, '1');
  } catch (error) {
    // Ignore sessionStorage failures and continue with best-effort notifications.
  }
};

const STATUS_LABEL_BY_CODE = {
  created: 'Pending',
  pickup_assigned: 'Pickup Assigned',
  picked_up: 'Picked Up',
  in_transit_to_origin_branch: 'In Transit To Branch',
  received_at_origin_branch: 'In Branch Origin',
  linehaul_assigned: 'Linehaul Assigned',
  linehaul_load_confirmed: 'Linehaul Load Confirmed',
  linehaul_in_transit: 'Linehaul In Transit',
  received_at_destination_branch: 'In Branch Destination',
  delivery_assigned: 'Delivery Assigned',
  delivery_load_confirmed: 'Delivery Load Confirmed',
  out_for_delivery: 'Out For Delivery',
  delivery_attempt_failed: 'Delivery Attempt Failed',
  waiting_for_reattempt: 'Waiting for Reattempt',
  rts_pending: 'Return to Sender In Progress',
  returned_to_sender: 'Returned to Sender',
  on_hold: 'On Hold',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
const SPEND_PERIOD_OPTIONS = [
  { value: 'lifetime', label: 'Lifetime' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' }
];
const getSpendPeriodLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'this_month') {
    return 'This month';
  }
  if (normalized === 'last_30_days') {
    return 'Last 30 days';
  }
  return 'Lifetime';
};

const buildCustomerStatusNotification = (booking) => {
  const statusCode = String(booking?.statusCode || '').trim().toLowerCase();
  if (!CUSTOMER_STATUS_NOTIFICATION_STATUSES.has(statusCode)) {
    return null;
  }
  const bookingCode = String(booking?.trackingNumber || '').trim();
  const bookingLabel = bookingCode ? `Booking ${bookingCode}` : 'Your booking';
  const trackingLink = bookingCode
    ? `/order-tracking?id=${encodeURIComponent(bookingCode)}`
    : '/order-tracking';
  const statusLabel = STATUS_LABEL_BY_CODE[statusCode] || statusCode.replaceAll('_', ' ');

  const byStatus = {
    pickup_assigned: {
      title: 'Pickup Assigned',
      message: `${bookingLabel}: pickup courier assigned.`
    },
    picked_up: {
      title: 'Package Picked Up',
      message: `${bookingLabel}: package has been picked up.`
    },
    linehaul_assigned: {
      title: 'Linehaul Assigned',
      message: `${bookingLabel}: linehaul courier assigned for branch transfer.`
    },
    linehaul_in_transit: {
      title: 'Linehaul In Transit',
      message: `${bookingLabel}: package is moving between branches.`
    },
    delivery_assigned: {
      title: 'Delivery Assigned',
      message: `${bookingLabel}: delivery courier assigned.`
    },
    delivery_load_confirmed: {
      title: 'Delivery Load Confirmed',
      message: `${bookingLabel}: parcel loaded for final delivery.`
    },
    out_for_delivery: {
      title: 'Out for Delivery',
      message: `${bookingLabel}: parcel is out for delivery.`
    },
    delivery_attempt_failed: {
      title: 'Delivery Attempt Failed',
      message: `${bookingLabel}: delivery attempt failed.`
    },
    waiting_for_reattempt: {
      title: 'Waiting for Reattempt',
      message: `${bookingLabel}: parcel is waiting for reattempt assignment.`
    },
    rts_pending: {
      title: 'Return to Sender In Progress',
      message: `${bookingLabel}: return to sender process has started.`
    },
    returned_to_sender: {
      title: 'Returned to Sender',
      message: `${bookingLabel}: parcel has been returned to sender.`
    },
    delivered: {
      title: 'Delivered',
      message: `${bookingLabel}: parcel delivered successfully.`
    },
    cancelled: {
      title: 'Order Cancelled',
      message: `${bookingLabel}: order was cancelled.`
    }
  };

  const resolved = byStatus[statusCode] || {
    title: statusLabel,
    message: `${bookingLabel}: status updated to ${statusLabel}.`
  };
  return {
    title: resolved.title,
    message: resolved.message,
    link: trackingLink,
    icon: statusCode === 'cancelled' || statusCode === 'returned_to_sender' ? 'XCircle' : 'Bell'
  };
};

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'User');
  const [summaryData, setSummaryData] = useState([]);
  const [bookingsData, setBookingsData] = useState([]);
  const [upcomingDeliveries, setUpcomingDeliveries] = useState([]);
  const [upcomingPickups, setUpcomingPickups] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chatBooking, setChatBooking] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null);
  const [isRatingOpen, setIsRatingOpen] = useState(false);
  const [visibleBookingCount, setVisibleBookingCount] = useState(BOOKINGS_PAGE_SIZE);
  const [finePaymentBusyByBooking, setFinePaymentBusyByBooking] = useState({});
  const [spendPeriod, setSpendPeriod] = useState('lifetime');
  const [spendBreakdown, setSpendBreakdown] = useState({
    period: 'lifetime',
    paidOrders: 0,
    paidAmount: 0
  });
  const [isSpendBreakdownOpen, setIsSpendBreakdownOpen] = useState(false);
  const userId = localStorage.getItem('userId');
  const userRole = localStorage.getItem('userRole') || 'customer';
  const notificationContext = useMemo(
    () => buildNotificationContext({ userRole: 'customer', userId }),
    [userId, userRole]
  );
  const userIdNumber = Number(userId);
  const bookingStatusSnapshotRef = useRef(new Map());
  const bookingHoldSnapshotRef = useRef(new Map());
  const hasInitializedBookingStatusSnapshotRef = useRef(false);
  const latestChatMessageByBookingRef = useRef(new Map());
  const processedFinePaymentCallbacksRef = useRef(new Set());

  const emitCustomerCancellationNotifications = useCallback((activities = []) => {
    const safeActivities = Array.isArray(activities) ? activities : [];
    safeActivities.forEach((activity) => {
      const title = String(activity?.title || '').trim().toLowerCase();
      const description = String(activity?.description || '').trim();
      const timestamp = String(activity?.timestamp || '').trim();
      if (title !== 'cancelled' && !description.toLowerCase().includes('cancel')) {
        return;
      }
      const dedupeKey = `__customer_cancel_notice_${timestamp || description}`;
      addInAppNotification(notificationContext, {
        type: 'alert',
        title: 'Order Cancelled',
        message: description || 'Your booking was cancelled after admin review.',
        icon: 'XCircle',
        link: '/user-dashboard',
        dedupeKey
      });
    });
  }, [notificationContext]);
  const emitCustomerStatusNotifications = useCallback((bookings = []) => {
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    const nextSnapshot = new Map();
    const nextHoldSnapshot = new Map();
    const isInitialSnapshot = !hasInitializedBookingStatusSnapshotRef.current;
    const shouldSeedInitialNotifications = isInitialSnapshot && !hasCustomerStatusNotificationsSeeded(userId);

    safeBookings.forEach((booking) => {
      const bookingId = Number(booking?.bookingId);
      const statusCode = String(booking?.statusCode || '').trim().toLowerCase();
      if (!Number.isFinite(bookingId) || !statusCode) {
        return;
      }
      nextSnapshot.set(bookingId, statusCode);
      nextHoldSnapshot.set(bookingId, Boolean(booking?.isOnHold));
    });

    if (isInitialSnapshot) {
      hasInitializedBookingStatusSnapshotRef.current = true;
    }

    safeBookings.forEach((booking) => {
      const bookingId = Number(booking?.bookingId);
      const statusCode = nextSnapshot.get(bookingId);
      if (!Number.isFinite(bookingId) || !statusCode) {
        return;
      }
      if (isInitialSnapshot && !shouldSeedInitialNotifications) {
        return;
      }
      const previousStatus = bookingStatusSnapshotRef.current.get(bookingId);
      if (previousStatus === statusCode) {
        return;
      }
      const notificationPayload = buildCustomerStatusNotification(booking);
      if (!notificationPayload) {
        return;
      }
      addInAppNotification(notificationContext, {
        type: 'delivery',
        title: notificationPayload.title,
        message: notificationPayload.message,
        icon: notificationPayload.icon,
        link: notificationPayload.link,
        dedupeKey: `__customer_status_${bookingId}_${statusCode}`
      });
    });

    safeBookings.forEach((booking) => {
      const bookingId = Number(booking?.bookingId);
      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        return;
      }
      const isOnHold = Boolean(nextHoldSnapshot.get(bookingId));
      const previousHold = Boolean(bookingHoldSnapshotRef.current.get(bookingId));
      const trackingNumber = String(booking?.trackingNumber || '').trim();
      const bookingLabel = trackingNumber ? `Booking ${trackingNumber}` : 'Your booking';
      const trackingLink = trackingNumber
        ? `/order-tracking?id=${encodeURIComponent(trackingNumber)}`
        : '/order-tracking';
      const fineAmount = Number(booking?.fine?.amount || 0);
      const fineReason = String(booking?.fine?.errorLabel || booking?.fine?.errorType || '').trim();

      if (isOnHold && !previousHold) {
        const holdMessage = Number.isFinite(fineAmount) && fineAmount > 0
          ? `${bookingLabel} is on hold due to pending fine payment of ${formatRs(fineAmount)}${fineReason ? ` (${fineReason})` : ''}.`
          : `${bookingLabel} is on hold due to pending fine payment${fineReason ? ` (${fineReason})` : ''}.`;
        addInAppNotification(notificationContext, {
          type: 'alert',
          title: 'Order On Hold',
          message: holdMessage,
          icon: 'AlertTriangle',
          link: trackingLink,
          dedupeKey: `__customer_hold_${bookingId}_on`
        });
      }

      if (!isOnHold && previousHold) {
        addInAppNotification(notificationContext, {
          type: 'delivery',
          title: 'Hold Cleared',
          message: `${bookingLabel} hold has been cleared.`,
          icon: 'CheckCircle',
          link: trackingLink,
          dedupeKey: `__customer_hold_${bookingId}_off`
        });
      }
    });

    bookingStatusSnapshotRef.current = nextSnapshot;
    bookingHoldSnapshotRef.current = nextHoldSnapshot;
    if (isInitialSnapshot && shouldSeedInitialNotifications) {
      markCustomerStatusNotificationsSeeded(userId);
    }
  }, [notificationContext, userId]);

  const markChatSeen = useCallback((bookingId, messageId) => {
    const safeBookingId = Number(bookingId);
    const safeMessageId = Number(messageId);
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    if (!Number.isFinite(safeBookingId) || safeBookingId <= 0) {
      return;
    }
    if (!Number.isFinite(safeMessageId) || safeMessageId <= 0) {
      return;
    }
    writeSeenMessageId(
      {
        bookingId: safeBookingId,
        userId: userIdNumber,
        userRole: 'customer',
        legKey: CHAT_LEG_GENERAL
      },
      safeMessageId
    );
  }, [userIdNumber]);

  const getRatingStorageKey = (id) => `ratingFlags_${id}`;

  const loadLocalRatingFlags = () => {
    if (!userId) {
      return {};
    }
    try {
      const raw = localStorage.getItem(getRatingStorageKey(userId));
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  };

  const saveLocalRatingFlags = (bookingId, stage) => {
    if (!userId || !bookingId || !stage) {
      return;
    }
    const existing = loadLocalRatingFlags();
    const next = {
      ...existing,
      [bookingId]: {
        ...(existing?.[bookingId] || {}),
        [stage]: true
      }
    };
    localStorage.setItem(getRatingStorageKey(userId), JSON.stringify(next));
  };

  const mergeLocalRatingFlags = (bookings) => {
    const localFlags = loadLocalRatingFlags();
    if (!localFlags || !bookings?.length) {
      return bookings;
    }
    return bookings.map((booking) => {
      const flags = booking?.bookingId ? localFlags?.[booking.bookingId] : null;
      if (!flags) {
        return booking;
      }
      return {
        ...booking,
        pickupRated: booking?.pickupRated || Boolean(flags?.pickup),
        deliveryRated: booking?.deliveryRated || Boolean(flags?.delivery)
      };
    });
  };

  useEffect(() => {
    let isMounted = true;
    const loadDashboard = async () => {
      if (!userId) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const [userRes, dashboardRes] = await Promise.all([
          fetch(`http://localhost:8000/api/users/${userId}`),
          fetch(`http://localhost:8000/api/dashboard/customer?userId=${userId}&spendPeriod=${encodeURIComponent(spendPeriod)}`)
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          if (isMounted) {
            setUserName(user?.fullName || 'User');
          }
        }

        if (dashboardRes.ok) {
          const dashboard = await dashboardRes.json();
          if (!isMounted) {
            return;
          }
          const summary = dashboard?.summary || {};
          setSpendBreakdown({
            period: String(dashboard?.spendBreakdown?.period || summary?.spendPeriod || spendPeriod),
            paidOrders: Number(dashboard?.spendBreakdown?.paidOrders || 0),
            paidAmount: Number(dashboard?.spendBreakdown?.paidAmount || 0)
          });
          setSummaryData([
            {
              key: 'active_deliveries',
              title: 'Active Deliveries',
              value: String(summary?.activeDeliveries || 0),
              subtitle: 'In progress',
              icon: 'Truck',
              iconColor: 'var(--color-primary)'
            },
            {
              key: 'completed_orders',
              title: 'Completed Orders',
              value: String(summary?.completedOrders || 0),
              subtitle: 'Completed',
              icon: 'CheckCircle',
              iconColor: 'var(--color-success)'
            },
            {
              key: 'total_spend',
              title: 'Total Spend',
              value: formatRs(summary?.totalSpend || 0),
              subtitle: getSpendPeriodLabel(summary?.spendPeriod || spendPeriod),
              icon: 'NepalRupee',
              iconColor: 'var(--color-accent)'
            },
            {
              key: 'pending_bookings',
              title: 'Pending Bookings',
              value: String(summary?.pendingBookings || 0),
              subtitle: 'Awaiting pickup',
              icon: 'Clock',
              iconColor: 'var(--color-warning)'
            }
          ]);

          const bookings = (dashboard?.bookings || []).map((booking, index) => ({
            ...booking,
            id: booking?.id || index + 1,
            createdAt: booking?.date || null,
            date: booking?.date ? new Date(booking.date).toLocaleDateString() : '',
            amount: formatRs(booking?.amount || 0)
          }));
          setBookingsData(mergeLocalRatingFlags(bookings));
          setUpcomingDeliveries(dashboard?.upcomingDeliveries || []);
          setUpcomingPickups(dashboard?.upcomingPickups || []);
          const activityList = dashboard?.recentActivities || [];
          setRecentActivities(activityList);
          emitCustomerStatusNotifications(bookings);
          emitCustomerCancellationNotifications(activityList);
        }
      } catch (error) {
        if (isMounted) {
          setSummaryData([]);
          setSpendBreakdown({
            period: spendPeriod,
            paidOrders: 0,
            paidAmount: 0
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
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
  }, [emitCustomerCancellationNotifications, emitCustomerStatusNotifications, spendPeriod, userId]);

  useEffect(() => {
    bookingStatusSnapshotRef.current = new Map();
    bookingHoldSnapshotRef.current = new Map();
    hasInitializedBookingStatusSnapshotRef.current = false;
  }, [userId]);

  useEffect(() => {
    latestChatMessageByBookingRef.current = new Map();
  }, [userId]);

  useEffect(() => {
    processedFinePaymentCallbacksRef.current = new Set();
    setFinePaymentBusyByBooking({});
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fineFlag = String(params.get('finePayment') || '').trim().toLowerCase();
    const pidx = String(params.get('pidx') || '').trim();
    const bookingIdFromQuery = Number(params.get('bookingId'));
    const hasFineCallback = (fineFlag === '1' || fineFlag === 'true') && pidx !== '';
    if (!hasFineCallback) {
      return;
    }
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    if (!Number.isFinite(bookingIdFromQuery) || bookingIdFromQuery <= 0) {
      navigate('/user-dashboard', { replace: true });
      return;
    }

    const callbackKey = `${bookingIdFromQuery}:${pidx}`;
    if (processedFinePaymentCallbacksRef.current.has(callbackKey)) {
      return;
    }
    processedFinePaymentCallbacksRef.current.add(callbackKey);

    const completeFinePayment = async () => {
      setFinePaymentBusyByBooking((prev) => ({ ...prev, [bookingIdFromQuery]: true }));
      try {
        const response = await fetch(`http://localhost:8000/api/customer/orders/${bookingIdFromQuery}/fine/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: userIdNumber,
            paymentMethod: 'wallet',
            pidx
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to verify fine payment.');
        }

        const nextStatusCode = String(payload?.booking?.status || '').trim().toLowerCase();
        const nextStatusLabel = nextStatusCode
          ? (STATUS_LABEL_BY_CODE[nextStatusCode] || nextStatusCode.replaceAll('_', ' '))
          : '';
        setBookingsData((prev) =>
          (prev || []).map((item) => {
            if (Number(item?.bookingId) !== bookingIdFromQuery) {
              return item;
            }
            return {
              ...item,
              statusCode: nextStatusCode || item?.statusCode,
              displayStatusCode: nextStatusCode || item?.displayStatusCode || item?.statusCode,
              status: nextStatusLabel || item?.status,
              isOnHold: payload?.hold?.isOnHold === false ? false : item?.isOnHold,
              fine: payload?.fine
                ? {
                    ...(item?.fine || {}),
                    ...payload.fine
                  }
                : item?.fine
            };
          })
        );

        const trackingNumber = String(payload?.booking?.code || '').trim();
        addInAppNotification(notificationContext, {
          type: 'success',
          title: 'Fine Paid',
          message: payload?.message || 'Fine payment completed and hold removed.',
          icon: 'CheckCircle',
          link: trackingNumber
            ? `/order-tracking?id=${encodeURIComponent(trackingNumber)}`
            : '/user-dashboard',
          dedupeKey: `__fine_paid_${bookingIdFromQuery}_${pidx}`
        });
      } catch (error) {
        addInAppNotification(notificationContext, {
          type: 'alert',
          title: 'Fine Payment Failed',
          message: error?.message || 'Unable to verify fine payment.',
          icon: 'AlertTriangle',
          link: '/user-dashboard',
          dedupeKey: `__fine_paid_error_${bookingIdFromQuery}_${pidx}`
        });
      } finally {
        setFinePaymentBusyByBooking((prev) => {
          const next = { ...prev };
          delete next[bookingIdFromQuery];
          return next;
        });
        navigate('/user-dashboard', { replace: true });
      }
    };

    completeFinePayment();
  }, [location.search, navigate, notificationContext, userIdNumber]);

  useEffect(() => {
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    const targetBookingId = Number(new URLSearchParams(location.search).get('chatBooking'));
    if (!Number.isFinite(targetBookingId) || targetBookingId <= 0) {
      return;
    }
    const candidateList = [
      ...(Array.isArray(bookingsData) ? bookingsData : []),
      ...(Array.isArray(upcomingPickups) ? upcomingPickups : []),
      ...(Array.isArray(upcomingDeliveries) ? upcomingDeliveries : [])
    ];
    const match = candidateList.find((item) => Number(item?.bookingId) === targetBookingId);
    setChatBooking({
      bookingId: targetBookingId,
      trackingNumber: String(
        match?.trackingNumber
        || match?.bookingCode
        || ''
      ).trim()
    });
    setIsChatOpen(true);
  }, [bookingsData, location.search, upcomingDeliveries, upcomingPickups, userIdNumber]);

  useEffect(() => {
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return undefined;
    }
    let isCancelled = false;
    const pollCustomerChatNotifications = async () => {
      const candidateMap = new Map();
      const sourceLists = [
        Array.isArray(upcomingPickups) ? upcomingPickups : [],
        Array.isArray(upcomingDeliveries) ? upcomingDeliveries : [],
        Array.isArray(bookingsData)
          ? bookingsData.filter((booking) => {
              const statusCode = String(booking?.statusCode || '').trim().toLowerCase();
              return CUSTOMER_CHAT_NOTIFICATION_STATUSES.has(statusCode);
            })
          : []
      ];
      sourceLists.flat().forEach((item) => {
        const bookingId = Number(item?.bookingId);
        if (!Number.isFinite(bookingId) || bookingId <= 0) {
          return;
        }
        if (!candidateMap.has(bookingId)) {
          candidateMap.set(bookingId, item);
        }
      });
      const candidates = Array.from(candidateMap.values()).slice(0, 12);
      if (candidates.length <= 0) {
        return;
      }

      await Promise.all(candidates.map(async (booking) => {
        const bookingId = Number(booking?.bookingId);
        if (!Number.isFinite(bookingId) || bookingId <= 0) {
          return;
        }
        const afterId = Number(latestChatMessageByBookingRef.current.get(bookingId) || 0);
        try {
          const params = new URLSearchParams({
            bookingId: String(bookingId),
            userId: String(userIdNumber),
            role: 'customer',
            afterId: String(afterId),
            limit: '120'
          });
          const response = await fetch(`http://localhost:8000/api/messages?${params.toString()}`);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || isCancelled) {
            return;
          }

          const messages = Array.isArray(payload?.messages) ? payload.messages : [];
          if (messages.length <= 0) {
            return;
          }
          const latestMessageId = Number(messages[messages.length - 1]?.id) || 0;
          if (latestMessageId > 0) {
            latestChatMessageByBookingRef.current.set(bookingId, latestMessageId);
          }

          if (isChatOpen && Number(chatBooking?.bookingId) === bookingId) {
            markChatSeen(bookingId, latestMessageId);
            return;
          }

          const seenMessageId = readSeenMessageId({
            bookingId,
            userId: userIdNumber,
            userRole: 'customer',
            legKey: CHAT_LEG_GENERAL
          });
          const incomingFromCourier = messages.filter((message) => {
            const messageId = Number(message?.id);
            const senderRole = String(message?.senderRole || '').trim().toLowerCase();
            const senderId = Number(message?.senderId);
            if (!Number.isFinite(messageId) || messageId <= seenMessageId) {
              return false;
            }
            if (senderId === userIdNumber) {
              return false;
            }
            return senderRole === 'courier';
          });
          if (incomingFromCourier.length <= 0) {
            return;
          }
          const latestIncoming = incomingFromCourier[incomingFromCourier.length - 1];
          const latestIncomingId = Number(latestIncoming?.id) || 0;
          const preview = String(latestIncoming?.message || '').trim();
          const trackingNumber = String(booking?.trackingNumber || booking?.bookingCode || '').trim();
          addInAppNotification(notificationContext, {
            type: 'message',
            title: trackingNumber ? `New Message - ${trackingNumber}` : 'New Message from Courier',
            message: preview || 'You received a new message from courier.',
            icon: 'MessageCircle',
            link: `/user-dashboard?chatBooking=${bookingId}`,
            dedupeKey: `__customer_dashboard_chat_${bookingId}_${latestIncomingId}`
          });
        } catch (error) {
          // Ignore transient polling errors.
        }
      }));
    };

    pollCustomerChatNotifications();
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollCustomerChatNotifications();
      }
    }, CHAT_NOTIFICATION_POLL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(pollId);
    };
  }, [
    bookingsData,
    chatBooking?.bookingId,
    isChatOpen,
    markChatSeen,
    notificationContext,
    upcomingDeliveries,
    upcomingPickups,
    userIdNumber
  ]);

  const statusOptions = useMemo(() => {
    const statusCodes = [...new Set(
      (bookingsData || [])
        .map((booking) => String(booking?.statusCode || '').trim().toLowerCase())
        .filter((statusCode) => statusCode.length > 0)
    )];
    statusCodes.sort((a, b) => {
      const aLabel = STATUS_LABEL_BY_CODE[a] || a.replaceAll('_', ' ');
      const bLabel = STATUS_LABEL_BY_CODE[b] || b.replaceAll('_', ' ');
      return aLabel.localeCompare(bLabel);
    });
    return [
      { value: 'all', label: 'All Status' },
      ...statusCodes.map((statusCode) => ({
        value: statusCode,
        label: STATUS_LABEL_BY_CODE[statusCode] || statusCode.replaceAll('_', ' ')
      }))
    ];
  }, [bookingsData]);

  const dateRangeOptions = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom Range' }];


  const handleTrackBooking = (booking) => {
    const trackingNumber = String(
      booking?.trackingNumber || booking?.bookingCode || ''
    ).trim();
    if (!trackingNumber) {
      navigate('/order-tracking');
      return;
    }
    navigate(`/order-tracking?id=${encodeURIComponent(trackingNumber)}`, {
      state: { trackingNumber }
    });
  };

  const handleRateBooking = (booking) => {
    setRatingTarget({ booking, stage: 'delivery' });
    setIsRatingOpen(true);
  };

  const handleRatePickup = (booking) => {
    setRatingTarget({ booking, stage: 'pickup' });
    setIsRatingOpen(true);
  };

  const handleCloseRating = () => {
    setIsRatingOpen(false);
    setRatingTarget(null);
  };

  const handleSubmitRating = async ({ rating, comment }) => {
    const target = ratingTarget;
    if (!target?.booking?.bookingId || !userId || !target?.stage) {
      return;
    }
    try {
      const res = await fetch('http://localhost:8000/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: target.booking.bookingId,
          raterId: Number(userId),
          stage: target.stage,
          rating,
          comment
        })
      });
      const payload = await res.json().catch(() => ({}));
      const alreadySubmitted = res.status === 409 && payload?.error === 'Rating already submitted';
      if (!res.ok && !alreadySubmitted) {
        throw new Error(payload?.error || 'Unable to submit rating');
      }
      if (res.ok || alreadySubmitted) {
        saveLocalRatingFlags(target.booking.bookingId, target.stage);
      }
      setBookingsData((prev) =>
        prev.map((item) => {
          const sameBooking = item?.bookingId
            ? item?.bookingId === target.booking.bookingId
            : item?.trackingNumber === target.booking.trackingNumber;
          if (!sameBooking) {
            return item;
          }
          if (target.stage === 'pickup') {
            return { ...item, pickupRated: true };
          }
          if (target.stage === 'delivery') {
            return { ...item, deliveryRated: true };
          }
          return item;
        })
      );
      handleCloseRating();
    } catch (error) {
      console.error(error);
    }
  };

  const handleRepeatBooking = (booking) => {
    navigate('/create-booking', { state: { repeatBooking: booking } });
  };

  const handleViewDeliveryProof = (booking) => {
    if (booking?.trackingNumber) {
      navigate(`/order-tracking?id=${encodeURIComponent(booking.trackingNumber)}#delivery-proof`, {
        state: { trackingNumber: booking?.trackingNumber }
      });
      return;
    }
    navigate('/order-tracking');
  };

  const handleNewBooking = () => {
    navigate('/create-booking');
  };

  const handlePayFine = async (booking) => {
    const bookingId = Number(booking?.bookingId);
    const fineStatus = String(booking?.fine?.status || '').trim().toLowerCase();
    if (!Number.isFinite(userIdNumber) || userIdNumber <= 0) {
      return;
    }
    if (!Number.isFinite(bookingId) || bookingId <= 0 || fineStatus !== 'pending') {
      return;
    }

    let redirected = false;
    setFinePaymentBusyByBooking((prev) => ({ ...prev, [bookingId]: true }));
    try {
      const callbackParams = new URLSearchParams({
        finePayment: '1',
        bookingId: String(bookingId)
      });
      const response = await fetch(`http://localhost:8000/api/customer/orders/${bookingId}/fine/pay/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: userIdNumber,
          returnUrl: `${window.location.origin}/user-dashboard?${callbackParams.toString()}`,
          websiteUrl: window.location.origin,
          customer: {
            name: userName,
            email: localStorage.getItem('userEmail') || '',
            phone: localStorage.getItem('userPhone') || ''
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to start fine payment.');
      }
      const paymentUrl = String(payload?.payment?.paymentUrl || '').trim();
      if (!paymentUrl) {
        throw new Error('Khalti payment link is unavailable right now.');
      }
      redirected = true;
      window.location.href = paymentUrl;
    } catch (error) {
      addInAppNotification(notificationContext, {
        type: 'alert',
        title: 'Fine Payment Failed',
        message: error?.message || 'Unable to start fine payment.',
        icon: 'AlertTriangle',
        link: '/user-dashboard',
        dedupeKey: `__fine_pay_start_error_${bookingId}`
      });
    } finally {
      if (!redirected) {
        setFinePaymentBusyByBooking((prev) => {
          const next = { ...prev };
          delete next[bookingId];
          return next;
        });
      }
    }
  };

  const latestQuickActionBooking = useMemo(
    () => (bookingsData || []).find((booking) => {
      const trackingNumber = String(booking?.trackingNumber || booking?.bookingCode || '').trim();
      return trackingNumber !== '';
    }) || null,
    [bookingsData]
  );

  const handleQuickAction = (action) => {
    switch (action) {
      case 'track':
        navigate('/order-tracking');
        break;
      case 'invoice':
        navigate('/user-invoices');
        break;
      case 'support': {
        const trackingNumber = String(
          latestQuickActionBooking?.trackingNumber || latestQuickActionBooking?.bookingCode || ''
        ).trim();
        if (!trackingNumber) {
          navigate('/order-tracking');
          break;
        }
        navigate(`/order-tracking?id=${encodeURIComponent(trackingNumber)}#support-help`, {
          state: { trackingNumber }
        });
        break;
      }
      case 'repeat':
        if (latestQuickActionBooking) {
          navigate('/create-booking', { state: { repeatBooking: latestQuickActionBooking } });
          break;
        }
        navigate('/create-booking');
        break;
      default:
        break;
    }
  };

  const handleOpenChat = (item) => {
    if (!item?.bookingId || !userId) {
      return;
    }
    const bookingId = Number(item?.bookingId);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    const latestMessageId = Number(latestChatMessageByBookingRef.current.get(bookingId) || 0);
    if (latestMessageId > 0) {
      markChatSeen(bookingId, latestMessageId);
    }
    setChatBooking({
      ...item,
      bookingId,
      trackingNumber: String(item?.trackingNumber || item?.bookingCode || '').trim()
    });
    setIsChatOpen(true);
    navigate(`/user-dashboard?chatBooking=${bookingId}`, { replace: true });
  };

  const handleCloseChat = () => {
    const activeBookingId = Number(chatBooking?.bookingId);
    const latestMessageId = Number(latestChatMessageByBookingRef.current.get(activeBookingId) || 0);
    if (Number.isFinite(activeBookingId) && activeBookingId > 0 && latestMessageId > 0) {
      markChatSeen(activeBookingId, latestMessageId);
    }
    setIsChatOpen(false);
    setChatBooking(null);
    if (new URLSearchParams(location.search).has('chatBooking')) {
      navigate('/user-dashboard', { replace: true });
    }
  };

  const handleChatMessagesChange = useCallback((snapshot) => {
    const bookingId = Number(snapshot?.bookingId);
    const lastMessageId = Number(snapshot?.lastMessageId || 0);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !Number.isFinite(lastMessageId) || lastMessageId <= 0) {
      return;
    }
    latestChatMessageByBookingRef.current.set(bookingId, lastMessageId);
    if (isChatOpen && Number(chatBooking?.bookingId) === bookingId) {
      markChatSeen(bookingId, lastMessageId);
    }
  }, [chatBooking?.bookingId, isChatOpen, markChatSeen]);

  const filteredBookings = useMemo(() => {
    const normalizedSearch = String(searchQuery || '').trim().toLowerCase();
    const now = new Date();

    return (bookingsData || []).filter((booking) => {
      const trackingNumber = String(booking?.trackingNumber || '').toLowerCase();
      const pickupAddress = String(booking?.pickup || '').toLowerCase();
      const deliveryAddress = String(booking?.delivery || '').toLowerCase();
      const packageType = String(booking?.packageType || '').toLowerCase();
      const matchesSearch = !normalizedSearch
        || trackingNumber.includes(normalizedSearch)
        || pickupAddress.includes(normalizedSearch)
        || deliveryAddress.includes(normalizedSearch)
        || packageType.includes(normalizedSearch);
      if (!matchesSearch) {
        return false;
      }

      const bookingStatus = String(booking?.statusCode || '').trim().toLowerCase();
      const matchesStatus = statusFilter === 'all' || bookingStatus === statusFilter;
      if (!matchesStatus) {
        return false;
      }

      if (dateRange === 'all' || dateRange === 'custom') {
        return true;
      }
      const createdAt = booking?.createdAt ? new Date(booking.createdAt) : null;
      if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
        return false;
      }
      if (dateRange === 'today') {
        return createdAt.toDateString() === now.toDateString();
      }
      if (dateRange === 'week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - 7);
        return createdAt >= weekStart;
      }
      if (dateRange === 'month') {
        const monthStart = new Date(now);
        monthStart.setDate(now.getDate() - 30);
        return createdAt >= monthStart;
      }
      return true;
    });
  }, [bookingsData, dateRange, searchQuery, statusFilter]);

  useEffect(() => {
    setVisibleBookingCount(BOOKINGS_PAGE_SIZE);
  }, [dateRange, searchQuery, statusFilter]);

  const visibleBookings = useMemo(
    () => filteredBookings.slice(0, visibleBookingCount),
    [filteredBookings, visibleBookingCount]
  );
  const hasMoreBookings = visibleBookingCount < filteredBookings.length;

  return (
    <div className="min-h-screen bg-background">
      <RoleBasedNavigation userRole={userRole} userName={userName} />
      <QuickActionPanel userRole={userRole} />
      <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-8 md:pb-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 md:mb-8 mt-6 md:mt-8">
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                Welcome back, {userName}!
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Track your deliveries and manage your bookings
              </p>
            </div>
            <Button
              variant="default"
              size="lg"
              iconName="PackagePlus"
              iconPosition="left"
              onClick={handleNewBooking}
              className="w-full lg:w-auto">

              New Booking
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <div className="md:col-span-2 lg:col-span-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Spend period
              </p>
              <div className="inline-flex items-center rounded-lg border border-border bg-card p-1">
                {SPEND_PERIOD_OPTIONS.map((option) => {
                  const isActive = spendPeriod === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-xs transition-smooth ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setSpendPeriod(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {summaryData?.map((item, index) => (
              <SummaryCard
                key={item?.key || index}
                {...item}
                hint={item?.key === 'total_spend' ? 'Paid orders only' : ''}
                actionLabel={item?.key === 'total_spend'
                  ? (isSpendBreakdownOpen ? 'Hide Breakdown' : 'View Breakdown')
                  : ''}
                onAction={item?.key === 'total_spend'
                  ? () => setIsSpendBreakdownOpen((previous) => !previous)
                  : null}
              />
            ))}
          </div>
          {isSpendBreakdownOpen ? (
            <div className="mb-6 md:mb-8 rounded-xl border border-border bg-card p-4 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base md:text-lg font-semibold text-foreground">Spend Breakdown</h3>
                  <p className="text-xs text-muted-foreground">
                    {getSpendPeriodLabel(spendBreakdown?.period)} summary of paid orders.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setIsSpendBreakdownOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">Paid Orders</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{Number(spendBreakdown?.paidOrders || 0)}</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">Paid Amount</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{formatRs(spendBreakdown?.paidAmount || 0)}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 mb-6 md:mb-8">
            <div className="lg:col-span-2">
              <div className="bg-card rounded-xl shadow-elevation-sm border border-border overflow-hidden">
                <div className="p-4 md:p-6 border-b border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <h2 className="text-lg md:text-xl font-semibold text-foreground">
                      Recent Bookings
                    </h2>
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm font-medium text-foreground hover:bg-muted/80 transition-smooth lg:hidden">

                      <Icon name="SlidersHorizontal" size={16} />
                      <span>Filters</span>
                    </button>
                  </div>

                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 ${
                    showFilters ? 'block' : 'hidden lg:grid'}`
                    }>

                    <Input
                      type="search"
                      placeholder="Search by tracking number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e?.target?.value)}
                      className="w-full" />

                    <Select
                      options={statusOptions}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      placeholder="Filter by status" />

                    <Select
                      options={dateRangeOptions}
                      value={dateRange}
                      onChange={setDateRange}
                      placeholder="Select date range" />

                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground">
                          Tracking
                        </th>
                        <th className="px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground hidden lg:table-cell">
                          Route
                        </th>
                        <th className="px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground hidden md:table-cell">
                          Package
                        </th>
                        <th className="w-[210px] px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground hidden sm:table-cell">
                          Amount
                        </th>
                        <th className="w-[170px] px-3 py-3 md:px-4 md:py-4 text-left text-xs md:text-sm font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBookings?.map((booking) =>
                      <BookingTableRow
                        key={booking?.id || booking?.bookingId}
                        booking={booking}
                        onTrack={handleTrackBooking}
                        onViewProof={handleViewDeliveryProof}
                        onRatePickup={handleRatePickup}
                        onRateDelivery={handleRateBooking}
                        onRepeat={handleRepeatBooking}
                        onPayFine={handlePayFine}
                        isPayFineBusy={Boolean(finePaymentBusyByBooking?.[Number(booking?.bookingId)])} />

                      )}
                      {visibleBookings?.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No bookings match your filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 md:p-6 border-t border-border flex items-center justify-between">
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Showing {visibleBookings?.length || 0} of {filteredBookings?.length || 0} bookings
                  </p>
                  {filteredBookings.length > BOOKINGS_PAGE_SIZE ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (hasMoreBookings) {
                          setVisibleBookingCount((previous) => previous + BOOKINGS_PAGE_SIZE);
                          return;
                        }
                        setVisibleBookingCount(BOOKINGS_PAGE_SIZE);
                      }}
                    >
                      {hasMoreBookings ? 'View More' : 'View Less'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-6 md:space-y-8">
              <div className="bg-card rounded-xl shadow-elevation-sm border border-border p-4 md:p-6">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <h3 className="text-base md:text-lg font-semibold text-foreground">
                    Upcoming Pickups
                  </h3>
                  <div className="w-6 h-6 md:w-7 md:h-7 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-xs md:text-sm font-semibold text-primary">
                      {upcomingPickups?.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 md:space-y-5">
                  {upcomingPickups?.map((pickup) =>
                  <UpcomingPickupCard
                    key={pickup?.id || pickup?.trackingNumber}
                    pickup={pickup}
                    onMessage={handleOpenChat}
                  />
                  )}
                </div>
              </div>

              <div className="bg-card rounded-xl shadow-elevation-sm border border-border p-4 md:p-6">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                  <h3 className="text-base md:text-lg font-semibold text-foreground">
                    Upcoming Deliveries
                  </h3>
                  <div className="w-6 h-6 md:w-7 md:h-7 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-xs md:text-sm font-semibold text-primary">
                      {upcomingDeliveries?.length}
                    </span>
                  </div>
                </div>
                <div className="space-y-4 md:space-y-5">
                  {upcomingDeliveries?.map((delivery) =>
                  <UpcomingDeliveryCard
                    key={delivery?.id || delivery?.trackingNumber}
                    delivery={delivery}
                    onMessage={handleOpenChat}
                  />
                  )}
                </div>
              </div>

              <div className="bg-card rounded-xl shadow-elevation-sm border border-border p-4 md:p-6">
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-4 md:mb-6">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <QuickActionButton
                    icon="MapPin"
                    label="Track Order"
                    onClick={() => handleQuickAction('track')}
                    color="var(--color-primary)" />

                  <QuickActionButton
                    icon="FileText"
                    label="Invoices"
                    onClick={() => handleQuickAction('invoice')}
                    color="var(--color-accent)" />

                  <QuickActionButton
                    icon="HeadphonesIcon"
                    label="Support"
                    onClick={() => handleQuickAction('support')}
                    color="var(--color-secondary)" />

                  <QuickActionButton
                    icon="RotateCcw"
                    label="Repeat Order"
                    onClick={() => handleQuickAction('repeat')}
                    color="var(--color-success)" />

                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl shadow-elevation-sm border border-border p-4 md:p-6">
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-4 md:mb-6">
              Recent Activity
            </h3>
            <div className="space-y-1 md:space-y-2">
              {recentActivities?.map((activity) =>
              <RecentActivityItem key={activity?.id} activity={activity} />
              )}
            </div>
            <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-border">
              <Button variant="ghost" size="sm" fullWidth iconName="ArrowRight" iconPosition="right">
                View All Activity
              </Button>
            </div>
          </div>
        </div>
      </main>
      <ChatModal
        isOpen={isChatOpen}
        onClose={handleCloseChat}
        bookingId={chatBooking?.bookingId}
        title={`Booking ${chatBooking?.trackingNumber || ''}`}
        currentUserId={userId}
        currentUserRole={userRole}
        onMessagesChange={handleChatMessagesChange}
      />
      <RatingModal
        isOpen={isRatingOpen}
        onClose={handleCloseRating}
        title={ratingTarget?.stage === 'pickup' ? 'Pickup Experience' : 'Delivery Experience'}
        onSubmit={handleSubmitRating}
      />
    </div>);

};

export default UserDashboard;


