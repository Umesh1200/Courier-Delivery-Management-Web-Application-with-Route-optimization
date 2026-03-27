import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import TrackingMap from './components/TrackingMap';
import DeliveryTimeline from './components/DeliveryTimeline';
import PackageDetails from './components/PackageDetails';
import CourierInfo from './components/CourierInfo';
import DeliveryProof from './components/DeliveryProof';
import SupportPanel from './components/SupportPanel';
import Icon from '../../components/AppIcon';
import Button from '../../components/ui/Button';
import ChatModal from '../../components/ui/ChatModal';
import { addInAppNotification, buildNotificationContext } from '../../utils/notifications';
import { CHAT_LEG_GENERAL, readSeenMessageId, writeSeenMessageId } from '../../utils/chatAccess';

const LIVE_TRACKING_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'linehaul_assigned',
  'linehaul_load_confirmed',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);
const LIVE_TRACKING_POLL_MS = 5000;
const APPROACH_DISTANCE_METERS = 2000;
const NEARBY_DISTANCE_METERS = 300;
const CHAT_ALLOWED_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'in_transit_to_origin_branch',
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);
const CLOSED_TRACKING_STATUSES = new Set(['cancelled', 'returned_to_sender']);

const normalizeChatActorRole = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (['customer', 'courier', 'admin'].includes(normalizedRole)) {
    return normalizedRole;
  }
  return 'customer';
};

const haversineDistanceMeters = (a, b) => {
  if (!a || !b) {
    return null;
  }
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(Number(b.lat) - Number(a.lat));
  const dLng = toRadians(Number(b.lng) - Number(a.lng));
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const arc = (Math.sin(dLat / 2) ** 2)
    + (Math.sin(dLng / 2) ** 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadius * Math.asin(Math.sqrt(arc));
};

const safeReadStorage = (key, fallback = '') => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
};

const OrderTracking = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const stateTracking = location?.state?.trackingNumber;
  const trackingId = searchParams?.get('id') || stateTracking || '';
  const queryAccessCode = searchParams?.get('accessCode') || searchParams?.get('access') || '';
  const finePaymentFlag = String(searchParams?.get('finePayment') || '').trim().toLowerCase();
  const finePaymentPidx = String(searchParams?.get('pidx') || '').trim();
  const [isLoading, setIsLoading] = useState(true);
  const [trackingData, setTrackingData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [trackingInput, setTrackingInput] = useState(trackingId);
  const [deliveryAccessCodeInput, setDeliveryAccessCodeInput] = useState(queryAccessCode);
  const [appliedDeliveryAccessCode, setAppliedDeliveryAccessCode] = useState(queryAccessCode);
  const [accessCodeError, setAccessCodeError] = useState('');
  const [reactivationNotes, setReactivationNotes] = useState('');
  const [reactivationFeedback, setReactivationFeedback] = useState(null);
  const [isReactivationSubmitting, setIsReactivationSubmitting] = useState(false);
  const [isFinePaying, setIsFinePaying] = useState(false);
  const [finePayError, setFinePayError] = useState('');
  const [finePayMessage, setFinePayMessage] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [proximityNotice, setProximityNotice] = useState(null);
  const processedFinePaymentCallbacksRef = useRef(new Set());
  const userName = safeReadStorage('userName', 'User');
  const userId = safeReadStorage('userId', '');
  const userRole = safeReadStorage('userRole', 'customer');
  const normalizedChatRole = useMemo(
    () => normalizeChatActorRole(userRole),
    [userRole]
  );
  const userIdNumber = Number(userId);
  const isSignedInUser = Number.isFinite(userIdNumber) && userIdNumber > 0;
  const trackingApiRole = isSignedInUser ? userRole : 'customer';
  const notificationContext = useMemo(
    () => buildNotificationContext({ userRole, userId }),
    [userId, userRole]
  );
  const bookingId = Number(trackingData?.bookingId || 0);
  const activeCourierId = Number(trackingData?.activeCourierId || 0);
  const statusCode = String(trackingData?.status || '').trim().toLowerCase();
  const displayStatusCode = String(trackingData?.displayStatus || trackingData?.status || '').trim().toLowerCase();
  const fineInfo = trackingData?.fine || null;
  const isOnHold = Boolean(trackingData?.isOnHold);
  const secureAccessGranted = Boolean(trackingData?.secureAccessGranted);
  const isDeliveryCompleted = statusCode === 'delivered';
  const isOrderClosed = CLOSED_TRACKING_STATUSES.has(statusCode);
  const isChatAllowedStatus = CHAT_ALLOWED_STATUSES.has(statusCode);
  const canRequestReactivation = Boolean(
    isSignedInUser
    && normalizedChatRole === 'customer'
    && statusCode === 'returned_to_sender'
    && bookingId > 0
  );
  const hasAssignedCourier = activeCourierId > 0
    && String(trackingData?.courier?.name || '').trim().toLowerCase() !== 'unassigned';
  const canViewChatHistory = bookingId > 0 && isSignedInUser && secureAccessGranted;
  const canSendChat = canViewChatHistory
    && hasAssignedCourier
    && isChatAllowedStatus
    && !isDeliveryCompleted
    && !isOrderClosed
    && (normalizedChatRole !== 'admin' || activeCourierId > 0);
  const shouldShowMessageButton = canSendChat;
  const canPayFine = Boolean(
    isSignedInUser
    && normalizedChatRole === 'customer'
    && bookingId > 0
    && secureAccessGranted
    && fineInfo
    && String(fineInfo?.status || '').trim().toLowerCase() === 'pending'
    && !isFinePaying
  );

  const chatDisabledReason = !secureAccessGranted
    ? 'Enter delivery access code to unlock chat.'
    : isDeliveryCompleted
      ? 'Chat closed - delivery completed'
      : isOrderClosed
        ? 'Chat closed - order is no longer active'
        : bookingId <= 0
          ? 'Chat is unavailable for this booking.'
          : !isSignedInUser
            ? 'Sign in to message from tracking.'
            : !hasAssignedCourier
              ? 'Courier is not assigned yet.'
              : !isChatAllowedStatus
                ? 'Chat is available only during pickup or delivery stages.'
                : (normalizedChatRole === 'admin' && activeCourierId <= 0)
                  ? 'No active courier is assigned for this booking.'
                  : '';

  const trackingBaseLink = useMemo(() => {
    const bookingCode = trackingData?.bookingCode || trackingId;
    const params = new URLSearchParams({ id: String(bookingCode) });
    if (secureAccessGranted && appliedDeliveryAccessCode) {
      params.set('accessCode', String(appliedDeliveryAccessCode));
    }
    return `/order-tracking?${params.toString()}`;
  }, [appliedDeliveryAccessCode, secureAccessGranted, trackingData?.bookingCode, trackingId]);
  const trackingChatLink = useMemo(() => (
    `${trackingBaseLink}#chat`
  ), [trackingBaseLink]);
  const trackingChatQueryParams = useMemo(() => (
    {
      context: 'tracking',
      accessCode: appliedDeliveryAccessCode
    }
  ), [appliedDeliveryAccessCode]);
  const trackingChatSendPayload = useMemo(() => (
    {
      context: 'tracking',
      accessCode: appliedDeliveryAccessCode
    }
  ), [appliedDeliveryAccessCode]);

  const markChatSeen = useCallback((messageId) => {
    const nextId = Number(messageId);
    if (!canViewChatHistory || !Number.isFinite(nextId) || nextId <= 0) {
      return;
    }
    writeSeenMessageId(
      {
        bookingId,
        userId: userIdNumber,
        userRole: normalizedChatRole === 'customer' ? 'customer' : normalizedChatRole,
        legKey: CHAT_LEG_GENERAL
      },
      nextId
    );
  }, [bookingId, canViewChatHistory, normalizedChatRole, userIdNumber]);

  const handleOpenChat = () => {
    if (!canSendChat) {
      if (chatDisabledReason) {
        addInAppNotification(notificationContext, {
          type: 'warning',
          title: 'Chat Unavailable',
          message: chatDisabledReason,
          icon: 'MessageCircle'
        });
      }
      return;
    }
    setIsChatOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatOpen(false);
    if (location?.hash === '#chat') {
      navigate(trackingBaseLink, { replace: true });
    }
  };

  const handleUnlockSecureFeatures = (event) => {
    event.preventDefault();
    const normalizedCode = String(deliveryAccessCodeInput || '').trim();
    if (!normalizedCode) {
      setAccessCodeError('Enter delivery access code to unlock live map and chat.');
      return;
    }
    setAccessCodeError('');
    setAppliedDeliveryAccessCode(normalizedCode);
    const bookingCode = String(trackingData?.bookingCode || trackingId || '').trim();
    if (bookingCode) {
      navigate(
        `/order-tracking?id=${encodeURIComponent(bookingCode)}&accessCode=${encodeURIComponent(normalizedCode)}`,
        {
          replace: true,
          state: { trackingNumber: bookingCode }
        }
      );
    }
  };

  const handleRequestReactivation = async (event) => {
    event.preventDefault();
    if (!canRequestReactivation || bookingId <= 0 || userIdNumber <= 0 || isReactivationSubmitting) {
      return;
    }
    try {
      setIsReactivationSubmitting(true);
      setReactivationFeedback(null);
      const response = await fetch(`http://localhost:8000/api/orders/${bookingId}/reactivation-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: userIdNumber,
          notes: String(reactivationNotes || '').trim()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setReactivationFeedback({
          type: 'info',
          message: payload?.error || 'A reactivation request is already pending for this order.'
        });
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit reactivation request.');
      }
      setReactivationFeedback({
        type: 'success',
        message: payload?.message || 'Reactivation request submitted for admin review.'
      });
    } catch (error) {
      setReactivationFeedback({
        type: 'error',
        message: error?.message || 'Unable to submit reactivation request.'
      });
    } finally {
      setIsReactivationSubmitting(false);
    }
  };

  const handlePayFine = async () => {
    if (!canPayFine || bookingId <= 0 || userIdNumber <= 0) {
      return;
    }
    try {
      setIsFinePaying(true);
      setFinePayError('');
      setFinePayMessage('');
      const bookingCode = String(trackingData?.bookingCode || trackingId || '').trim();
      if (!bookingCode) {
        throw new Error('Tracking code is required to start fine payment.');
      }
      const callbackParams = new URLSearchParams({ id: bookingCode, finePayment: '1' });
      if (appliedDeliveryAccessCode) {
        callbackParams.set('accessCode', String(appliedDeliveryAccessCode));
      }
      const response = await fetch(`http://localhost:8000/api/customer/orders/${bookingId}/fine/pay/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: userIdNumber,
          returnUrl: `${window.location.origin}/order-tracking?${callbackParams.toString()}`,
          websiteUrl: window.location.origin,
          customer: {
            name: userName,
            email: safeReadStorage('userEmail', ''),
            phone: safeReadStorage('userPhone', '')
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
      window.location.href = paymentUrl;
    } catch (error) {
      setFinePayError(error?.message || 'Unable to start fine payment.');
      setIsFinePaying(false);
    }
  };

  useEffect(() => {
    const hasFineFlag = finePaymentFlag === '1' || finePaymentFlag === 'true';
    if (!hasFineFlag || finePaymentPidx === '') {
      return;
    }
    if (!isSignedInUser || normalizedChatRole !== 'customer' || bookingId <= 0 || userIdNumber <= 0) {
      return;
    }

    const callbackKey = `${bookingId}:${finePaymentPidx}`;
    if (processedFinePaymentCallbacksRef.current.has(callbackKey)) {
      return;
    }
    processedFinePaymentCallbacksRef.current.add(callbackKey);

    const completeFinePayment = async () => {
      try {
        setIsFinePaying(true);
        setFinePayError('');
        setFinePayMessage('');
        const response = await fetch(`http://localhost:8000/api/customer/orders/${bookingId}/fine/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: userIdNumber,
            paymentMethod: 'wallet',
            pidx: finePaymentPidx
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to verify fine payment.');
        }
        setFinePayMessage(payload?.message || 'Fine payment completed.');

        const params = new URLSearchParams({
          trackingId,
          role: trackingApiRole
        });
        if (userId) {
          params.set('userId', userId);
        }
        if (appliedDeliveryAccessCode) {
          params.set('accessCode', String(appliedDeliveryAccessCode));
        }
        const refreshResponse = await fetch(`http://localhost:8000/api/tracking?${params.toString()}`);
        const refreshPayload = await refreshResponse.json().catch(() => null);
        if (refreshResponse.ok && refreshPayload) {
          setTrackingData(refreshPayload);
        }

        navigate(trackingBaseLink, { replace: true, state: { trackingNumber: trackingId } });
      } catch (error) {
        setFinePayError(error?.message || 'Unable to verify fine payment.');
      } finally {
        setIsFinePaying(false);
      }
    };

    completeFinePayment();
  }, [
    appliedDeliveryAccessCode,
    bookingId,
    finePaymentFlag,
    finePaymentPidx,
    isSignedInUser,
    navigate,
    normalizedChatRole,
    trackingApiRole,
    trackingBaseLink,
    trackingId,
    userId,
    userIdNumber
  ]);

  useEffect(() => {
    let isMounted = true;

    const fetchTracking = async () => {
      if (!trackingId) {
        if (isMounted) {
          setTrackingData(null);
          setErrorMessage('Enter a tracking number to view details.');
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setErrorMessage('');
        const params = new URLSearchParams({
          trackingId,
          role: trackingApiRole
        });
        if (userId) {
          params.set('userId', userId);
        }
        if (appliedDeliveryAccessCode) {
          params.set('accessCode', String(appliedDeliveryAccessCode));
        }
        const response = await fetch(`http://localhost:8000/api/tracking?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load tracking data.');
        }
        if (isMounted) {
          setTrackingData(payload);
          if (payload?.secureAccessGranted) {
            setAccessCodeError('');
          } else if (appliedDeliveryAccessCode) {
            setAccessCodeError(payload?.secureAccessError || 'Invalid delivery access code.');
          }
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setTrackingData(null);
          setErrorMessage(error?.message || 'Unable to load tracking data.');
          setIsLoading(false);
        }
      }
    };

    fetchTracking();

    return () => {
      isMounted = false;
    };
  }, [appliedDeliveryAccessCode, trackingApiRole, trackingId, userId]);

  useEffect(() => {
    setTrackingInput(trackingId);
  }, [trackingId]);

  useEffect(() => {
    const normalized = String(queryAccessCode || '').trim();
    setDeliveryAccessCodeInput(normalized);
    setAppliedDeliveryAccessCode(normalized);
    setAccessCodeError('');
  }, [queryAccessCode, trackingId]);

  useEffect(() => {
    setReactivationNotes('');
    setReactivationFeedback(null);
    setIsReactivationSubmitting(false);
    setFinePayError('');
    setFinePayMessage('');
    setIsFinePaying(false);
  }, [trackingData?.bookingId]);

  useEffect(() => {
    if (location?.hash !== '#chat' || !canViewChatHistory) {
      return;
    }
    setIsChatOpen(true);
  }, [canViewChatHistory, location?.hash]);

  useEffect(() => {
    if (userRole !== 'customer' || !canViewChatHistory) {
      return undefined;
    }

    let isCancelled = false;
    const pollMessages = async () => {
      try {
        const params = new URLSearchParams({
          bookingId: String(bookingId),
          userId: String(userIdNumber),
          role: normalizedChatRole,
          context: 'tracking',
          afterId: '0',
          limit: '200'
        });
        if (appliedDeliveryAccessCode) {
          params.set('accessCode', String(appliedDeliveryAccessCode));
        }
        const response = await fetch(`http://localhost:8000/api/messages?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || isCancelled) {
          return;
        }
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        if (messages.length <= 0) {
          return;
        }

        const seenMessageId = readSeenMessageId({
          bookingId,
          userId: userIdNumber,
          userRole: normalizedChatRole === 'customer' ? 'customer' : normalizedChatRole,
          legKey: CHAT_LEG_GENERAL
        });
        const newestMessageId = Number(messages[messages.length - 1]?.id) || 0;

        if (isChatOpen) {
          markChatSeen(newestMessageId);
          return;
        }

        const incomingFromCourier = messages.filter((message) => {
          const messageId = Number(message?.id);
          if (!Number.isFinite(messageId) || messageId <= seenMessageId) {
            return false;
          }
          if (Number(message?.senderId) === userIdNumber) {
            return false;
          }
          return String(message?.senderRole || '').trim().toLowerCase() === 'courier';
        });
        if (incomingFromCourier.length <= 0) {
          return;
        }

        const latestIncoming = incomingFromCourier[incomingFromCourier.length - 1];
        const latestIncomingId = Number(latestIncoming?.id) || 0;
        const preview = String(latestIncoming?.message || '').trim();
        addInAppNotification(notificationContext, {
          type: 'message',
          title: 'New Message from Courier',
          message: preview || 'You received a new message.',
          icon: 'MessageCircle',
          link: trackingChatLink,
          dedupeKey: `__tracking_chat_${bookingId}_${latestIncomingId}`
        });
      } catch (error) {
        // Ignore transient polling errors.
      }
    };

    pollMessages();
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollMessages();
      }
    }, LIVE_TRACKING_POLL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(pollId);
    };
  }, [
    bookingId,
    canViewChatHistory,
    isChatOpen,
    markChatSeen,
    normalizedChatRole,
    notificationContext,
    appliedDeliveryAccessCode,
    trackingChatLink,
    userIdNumber,
    userRole
  ]);

  const handleChatMessagesChange = useCallback((snapshot) => {
    if (!isChatOpen) {
      return;
    }
    const latestMessageId = Number(snapshot?.lastMessageId) || 0;
    markChatSeen(latestMessageId);
  }, [isChatOpen, markChatSeen]);

  useEffect(() => {
    if (!trackingId || !trackingData) {
      return undefined;
    }
    if (isChatOpen) {
      return undefined;
    }
    const currentStatus = String(trackingData?.status || '').trim().toLowerCase();
    const isLiveTrackingStage = Boolean(
      trackingData?.isLiveTrackingEnabled
      ?? LIVE_TRACKING_STATUSES.has(currentStatus)
    );
    if (!isLiveTrackingStage) {
      return undefined;
    }

    let isMounted = true;
    const refreshTracking = async () => {
      try {
        const params = new URLSearchParams({
          trackingId,
          role: trackingApiRole
        });
        if (userId) {
          params.set('userId', userId);
        }
        if (appliedDeliveryAccessCode) {
          params.set('accessCode', String(appliedDeliveryAccessCode));
        }
        const response = await fetch(`http://localhost:8000/api/tracking?${params.toString()}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to refresh tracking data.');
        }
        if (isMounted) {
          setTrackingData(payload);
        }
      } catch (error) {
        // Keep prior UI data when one refresh cycle fails.
      }
    };

    const interval = setInterval(refreshTracking, LIVE_TRACKING_POLL_MS);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [appliedDeliveryAccessCode, isChatOpen, trackingApiRole, trackingData?.isLiveTrackingEnabled, trackingData?.status, trackingId, userId]);

  const renderTopNavigation = () => {
    if (isSignedInUser) {
      return (
        <>
          <RoleBasedNavigation userRole={userRole} userName={userName} />
          <QuickActionPanel userRole={userRole} />
        </>
      );
    }

    return (
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border shadow-elevation-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <button
              type="button"
              className="flex items-center gap-3"
              onClick={() => navigate('/landing-page')}
            >
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon name="Package" size={24} color="var(--color-primary)" />
              </div>
              <span className="text-xl font-semibold text-foreground hidden sm:block">CourierFlow</span>
            </button>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/landing-page')}
              >
                Back to Home
              </Button>
              <Button
                variant="default"
                size="sm"
                iconName="LogIn"
                iconPosition="left"
                onClick={() => navigate('/login')}
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>
    );
  };

  useEffect(() => {
    if (userRole !== 'customer' || !trackingData?.bookingId) {
      return;
    }

    const stage = String(trackingData?.notificationStage || '').trim().toLowerCase();
    const statusCode = String(trackingData?.status || '').trim().toLowerCase();
    const notificationContext = buildNotificationContext({ userRole, userId });
    const redirectUrl = trackingBaseLink;

    if (stage === 'delivery' && statusCode === 'delivery_assigned') {
      addInAppNotification(notificationContext, {
        type: 'delivery',
        title: 'Delivery Assigned',
        message: 'A delivery courier has been assigned to your parcel.',
        link: redirectUrl,
        icon: 'Truck',
        dedupeKey: `__tracking_stage_notice_${trackingData.bookingId}_${statusCode}`
      });
    }

    if (stage === 'delivery' && statusCode === 'out_for_delivery') {
      addInAppNotification(notificationContext, {
        type: 'delivery',
        title: 'Out for Delivery',
        message: 'Your parcel is now out for delivery.',
        link: redirectUrl,
        icon: 'Navigation',
        dedupeKey: `__tracking_stage_notice_${trackingData.bookingId}_${statusCode}`
      });
    }

    if (statusCode === 'cancelled' || statusCode === 'returned_to_sender') {
      addInAppNotification(notificationContext, {
        type: 'alert',
        title: statusCode === 'returned_to_sender' ? 'Order Returned to Sender' : 'Order Cancelled',
        message: statusCode === 'returned_to_sender'
          ? 'Your shipment has been returned to sender.'
          : 'Your order was cancelled after admin review.',
        link: redirectUrl,
        icon: 'XCircle',
        dedupeKey: `__tracking_stage_notice_${trackingData.bookingId}_${statusCode}`
      });
    }

    const fineId = Number(trackingData?.fine?.id || 0);
    const fineStatus = String(trackingData?.fine?.status || '').trim().toLowerCase();
    if (fineId > 0 && fineStatus === 'pending') {
      const fineAmount = Number(trackingData?.fine?.amount || 0);
      const reasonLabel = String(trackingData?.fine?.errorLabel || '').trim();
      addInAppNotification(notificationContext, {
        type: 'alert',
        title: 'Order On Hold',
        message: Number.isFinite(fineAmount) && fineAmount > 0
          ? `Order is on hold due to pending fine of RS ${fineAmount.toFixed(2)}${reasonLabel ? ` (${reasonLabel})` : ''}.`
          : `Order is on hold due to pending fine${reasonLabel ? ` (${reasonLabel})` : ''}.`,
        link: redirectUrl,
        icon: 'AlertTriangle',
        dedupeKey: `__tracking_fine_${trackingData.bookingId}_${fineId}_pending`
      });
    }
    if (fineId > 0 && fineStatus === 'applied') {
      addInAppNotification(notificationContext, {
        type: 'delivery',
        title: 'Fine Payment Received',
        message: 'Fine has been paid and hold is removed.',
        link: redirectUrl,
        icon: 'CheckCircle',
        dedupeKey: `__tracking_fine_${trackingData.bookingId}_${fineId}_applied`
      });
    }

    const courierLocation = trackingData?.courierLocation;
    const targetLocation = trackingData?.targetLocation;
    if (!stage || !courierLocation || !targetLocation) {
      return;
    }

    let distanceMeters = Number(trackingData?.distanceToTargetMeters);
    if (!Number.isFinite(distanceMeters)) {
      distanceMeters = haversineDistanceMeters(courierLocation, targetLocation);
    }
    if (!Number.isFinite(distanceMeters)) {
      return;
    }

    let bucket = '';
    if (distanceMeters <= NEARBY_DISTANCE_METERS) {
      bucket = 'nearby';
    } else if (distanceMeters <= APPROACH_DISTANCE_METERS) {
      bucket = 'approaching';
    }
    if (!bucket) {
      return;
    }

    const storageKey = `__tracking_notice_${trackingData.bookingId}_${statusCode}_${bucket}`;
    try {
      if (window.localStorage.getItem(storageKey)) {
        return;
      }
      window.localStorage.setItem(storageKey, String(Date.now()));
    } catch (error) {
      // Ignore storage errors and still show best-effort notification.
    }

    const stageLabel = stage === 'pickup' ? 'pickup point' : 'delivery point';
    const roundedDistance = Math.max(1, Math.round(distanceMeters));
    const title = bucket === 'nearby' ? 'Courier Nearby' : 'Courier Approaching';
    const message = bucket === 'nearby'
      ? `Courier is ${roundedDistance}m from your ${stageLabel}.`
      : `Courier is approaching your ${stageLabel}.`;
    setProximityNotice({
      title,
      message,
      redirectUrl
    });

    addInAppNotification(
      notificationContext,
      {
        type: 'proximity',
        title,
        message,
        link: redirectUrl,
        icon: bucket === 'nearby' ? 'BellRing' : 'Bell',
        dedupeKey: storageKey
      }
    );
  }, [trackingBaseLink, trackingData, trackingId, userId, userRole]);

  useEffect(() => {
    if (!trackingData) {
      return;
    }
    const hash = String(location?.hash || '').trim().toLowerCase();
    const targetId = hash === '#delivery-proof'
      ? 'delivery-proof'
      : (hash === '#support' || hash === '#support-help' ? 'support-help' : '');
    if (!targetId) {
      return;
    }
    const targetSection = document.getElementById(targetId);
    if (!targetSection) {
      return;
    }
    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location?.hash, trackingData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {renderTopNavigation()}
        <div className="pt-[60px] min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm md:text-base text-muted-foreground">Loading tracking information...</p>
          </div>
        </div>
      </div>);

  }

  if (!trackingData) {
    const handleTrackSubmit = (event) => {
      event.preventDefault();
      const nextId = trackingInput?.trim();
      if (!nextId) {
        setErrorMessage('Enter a tracking number to view details.');
        return;
      }
      const params = new URLSearchParams({ id: nextId });
      const accessCode = String(appliedDeliveryAccessCode || '').trim();
      if (accessCode) {
        params.set('accessCode', accessCode);
      }
      navigate(`/order-tracking?${params.toString()}`, {
        state: { trackingNumber: nextId }
      });
    };

    return (
      <div className="min-h-screen bg-background flex flex-col">
        {renderTopNavigation()}
        <main className="pt-[60px] pb-8 flex-1">
          <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10">
            <div className="bg-card rounded-xl shadow-elevation-md p-6 text-center">
              <Icon name="Info" size={24} color="var(--color-primary)" />
              <h2 className="text-lg font-semibold text-foreground mt-3">Tracking details unavailable</h2>
              <p className="text-sm text-muted-foreground mt-2">
                {errorMessage || 'We could not find the tracking details for this booking.'}
              </p>
              <form className="mt-6 flex flex-col sm:flex-row gap-3" onSubmit={handleTrackSubmit}>
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="Enter tracking number"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button type="submit" variant="default" size="default">
                  Track
                </Button>
              </form>
            </div>
          </div>
        </main>
        <footer className="bg-card border-t border-border py-6 pb-20 md:py-8 md:pb-8">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
                &copy; {new Date()?.getFullYear()} CourierFlow. All rights reserved.
              </p>
              <div className="flex items-center gap-4 md:gap-6">
                <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                  Privacy Policy
                </a>
                <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                  Terms of Service
                </a>
                <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                  Contact Support
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {renderTopNavigation()}
      <main className="pt-[60px] pb-8 flex-1">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8">
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                  Track Your Order
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  Real-time updates for booking #{trackingData?.bookingCode || trackingData?.bookingId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="default" iconName="Share2" iconPosition="left">
                  Share
                </Button>
                <Button variant="default" size="default" iconName="Download" iconPosition="left">
                  Download
                </Button>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-border bg-card p-4 md:p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Icon name={secureAccessGranted ? 'ShieldCheck' : 'Lock'} size={18} color="var(--color-primary)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Live Map + Chat Access</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking code shows public status updates. Enter delivery access code to unlock live map tracking and chat.
                </p>
                <form className="mt-3 flex flex-col sm:flex-row gap-2" onSubmit={handleUnlockSecureFeatures}>
                  <input
                    type="text"
                    value={deliveryAccessCodeInput}
                    onChange={(event) => {
                      setDeliveryAccessCodeInput(event?.target?.value || '');
                      if (accessCodeError) {
                        setAccessCodeError('');
                      }
                    }}
                    placeholder="Enter delivery access code"
                    className="h-10 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <Button type="submit" variant={secureAccessGranted ? 'outline' : 'default'} size="default">
                    {secureAccessGranted ? 'Update Code' : 'Unlock'}
                  </Button>
                </form>
                {secureAccessGranted ? (
                  <p className="mt-2 text-xs text-success">Secure features unlocked.</p>
                ) : null}
                {accessCodeError ? (
                  <p className="mt-2 text-xs text-error">{accessCodeError}</p>
                ) : null}
              </div>
            </div>
          </div>

          {fineInfo ? (
            <div className={`mb-6 rounded-xl border p-4 md:p-5 ${isOnHold ? 'border-warning/40 bg-warning/10' : 'border-success/30 bg-success/10'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${isOnHold ? 'bg-warning/20' : 'bg-success/20'}`}>
                    <Icon name={isOnHold ? 'AlertTriangle' : 'CheckCircle2'} size={18} color={isOnHold ? 'var(--color-warning)' : 'var(--color-success)'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {isOnHold ? 'Status: On Hold' : `Status: ${String(displayStatusCode || statusCode).replaceAll('_', ' ')}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fine reason: <span className="text-foreground">{fineInfo?.errorLabel || fineInfo?.errorType || 'N/A'}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fine amount: <span className="text-foreground">RS {Number(fineInfo?.amount || 0).toFixed(2)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fine status: <span className="text-foreground">{String(fineInfo?.status || '').replaceAll('_', ' ') || 'pending'}</span>
                    </p>
                    {fineInfo?.notes ? (
                      <p className="text-xs text-muted-foreground">
                        Reason note: <span className="text-foreground">{fineInfo.notes}</span>
                      </p>
                    ) : null}
                    {finePayMessage ? (
                      <p className="mt-2 text-xs text-success">{finePayMessage}</p>
                    ) : null}
                    {finePayError ? (
                      <p className="mt-2 text-xs text-error">{finePayError}</p>
                    ) : null}
                  </div>
                </div>
                {String(fineInfo?.status || '').trim().toLowerCase() === 'pending' ? (
                  <Button
                    variant="default"
                    size="sm"
                    iconName="Wallet"
                    iconPosition="left"
                    onClick={handlePayFine}
                    disabled={!canPayFine}
                    title={canPayFine ? 'Pay pending fine' : 'Sign in as booking customer and unlock secure access to pay fine'}
                  >
                    {isFinePaying ? 'Paying...' : 'Pay Fine'}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {proximityNotice ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate(proximityNotice?.redirectUrl || trackingBaseLink)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(proximityNotice?.redirectUrl || trackingBaseLink);
                }
              }}
              className="mb-6 w-full rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition-smooth hover:bg-primary/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Icon name="BellRing" size={16} color="var(--color-primary)" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{proximityNotice?.title}</p>
                    <p className="text-xs text-muted-foreground">{proximityNotice?.message}</p>
                    <p className="mt-1 text-xs font-medium text-primary">Open tracking</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setProximityNotice(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            <div className="lg:col-span-2 space-y-6 md:space-y-8">
              {isChatOpen ? (
                <div className="bg-card rounded-xl shadow-elevation-md p-4 border border-border">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name="MessageCircle" size={16} color="var(--color-primary)" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Chat is open</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Live map stays visible, and tracking refresh is paused while chat is open.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
              {!secureAccessGranted ? (
                <div className="bg-card rounded-xl shadow-elevation-md p-6 border border-border">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name="Lock" size={18} color="var(--color-warning)" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Live tracking map is locked</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the delivery access code above to unlock live courier location and route tracking.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={isChatOpen ? 'opacity-90' : ''}>
                  <TrackingMap trackingData={trackingData} />
                </div>
              )}
              <DeliveryTimeline timeline={trackingData?.timeline} />
              <DeliveryProof proof={trackingData?.deliveryProof} />
            </div>

            <div className="space-y-6 md:space-y-8">
              <PackageDetails packageInfo={trackingData?.packageInfo} />
              {canRequestReactivation ? (
                <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name="RotateCcw" size={18} color="var(--color-warning)" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Request Shipment Reactivation</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Ask admin to reactivate this shipment for a new delivery attempt.
                      </p>
                    </div>
                  </div>
                  <form className="mt-4 space-y-3" onSubmit={handleRequestReactivation}>
                    <textarea
                      value={reactivationNotes}
                      onChange={(event) => setReactivationNotes(event?.target?.value || '')}
                      placeholder="Optional note for admin"
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Button
                      type="submit"
                      variant="default"
                      size="default"
                      disabled={isReactivationSubmitting}
                    >
                      {isReactivationSubmitting ? 'Submitting Request...' : 'Request Reactivation'}
                    </Button>
                  </form>
                  {reactivationFeedback ? (
                    <p className={`mt-3 text-xs ${
                      reactivationFeedback.type === 'success'
                        ? 'text-success'
                        : reactivationFeedback.type === 'error'
                          ? 'text-error'
                          : 'text-warning'
                    }`}>
                      {reactivationFeedback.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <CourierInfo
                courier={trackingData?.courier}
                onMessage={handleOpenChat}
                showMessageAction={shouldShowMessageButton}
                canMessage={canSendChat}
                messageDisabledReason={chatDisabledReason}
              />
              <div id="support-help">
                <SupportPanel
                  bookingId={trackingData?.bookingId}
                  bookingCode={trackingData?.bookingCode}
                />
              </div>
              <ChatModal
                isOpen={isChatOpen}
                onClose={handleCloseChat}
                bookingId={trackingData?.bookingId}
                title={`Booking ${trackingData?.bookingCode || trackingId}`}
                currentUserId={userIdNumber}
                currentUserRole={normalizedChatRole}
                canSend={canSendChat}
                disabledReason={chatDisabledReason}
                onMessagesChange={handleChatMessagesChange}
                recipientId={normalizedChatRole === 'admin' && activeCourierId > 0 ? activeCourierId : null}
                recipientRole={normalizedChatRole === 'admin' && activeCourierId > 0 ? 'courier' : ''}
                layout="side-panel"
                queryParams={trackingChatQueryParams}
                sendPayload={trackingChatSendPayload}
              />
            </div>
          </div>

          <div className="mt-8 bg-card rounded-xl shadow-elevation-md p-4 md:p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="Info" size={20} color="var(--color-primary)" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm md:text-base font-semibold text-foreground mb-2">
                  Tracking Information
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground mb-3">
                  Your package location is updated every 5 minutes. Estimated delivery time may vary based on traffic conditions and route optimization.
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Icon name="Clock" size={14} />
                    <span>Last updated: 2 mins ago</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon name="MapPin" size={14} />
                    <span>Next update: 3 mins</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="bg-card border-t border-border py-6 pb-20 md:py-8 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs md:text-sm text-muted-foreground text-center md:text-left">
              &copy; {new Date()?.getFullYear()} CourierFlow. All rights reserved.
            </p>
            <div className="flex items-center gap-4 md:gap-6">
              <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Privacy Policy
              </a>
              <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Terms of Service
              </a>
              <a href="#" className="text-xs md:text-sm text-muted-foreground hover:text-foreground transition-smooth">
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>);

};

export default OrderTracking;
