import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import DangerActionModal from '../../../components/ui/DangerActionModal';
import { buildApiUrl } from '../../../utils/api';
import {
  ADMIN_FINAL_CANCELLATION_REASONS,
  ADMIN_INCIDENT_REJECTION_REASONS,
  ADMIN_PRE_PICKUP_FORCE_CANCELLATION_REASONS,
  REFUND_ACTION_OPTIONS,
  findReasonLabel
} from '../../../utils/cancellation';

const OrderManagementPanel = ({ onOpenChat = null }) => {
  const fineOptions = [
    {
      value: 'under-reported-weight',
      label: 'Under-reported Weight',
      immediateResult: 'Delayed sorting',
      financialResult: 'Pay extra to resume'
    },
    {
      value: 'too-large-vehicle',
      label: 'Too Large for Vehicle',
      immediateResult: 'Pickup Refusal',
      financialResult: 'Cancellation fee'
    },
    {
      value: 'wrong-street-number',
      label: 'Wrong Street Number',
      immediateResult: 'Package held at hub',
      financialResult: 'Address correction fee'
    },
    {
      value: 'wrong-city-postal',
      label: 'Wrong City/Postal Code',
      immediateResult: 'Rerouted to wrong state',
      financialResult: 'High rerouting costs + 3-5 day delay'
    }
  ];
  const fineIssueAllowedStatuses = new Set([
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
  ]);
  const deliveredReopenReasonOptions = [
    { value: 'proof_issue', label: 'Delivery proof issue' },
    { value: 'wrong_scan', label: 'Wrong delivery scan' },
    { value: 'customer_not_received', label: 'Customer did not receive parcel' },
    { value: 'fraud_flag', label: 'Fraud or misuse suspected' },
    { value: 'other', label: 'Other verified reason' }
  ];
  const deliveredReopenStatusOptions = [
    { value: 'delivery_attempt_failed', label: 'Delivery Attempt Failed' },
    { value: 'out_for_delivery', label: 'Out For Delivery' },
    { value: 'waiting_for_reattempt', label: 'Waiting for Reattempt' }
  ];

  const [orders, setOrders] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [pickupCouriersByOrder, setPickupCouriersByOrder] = useState({});
  const [pickupCouriersLoadingByOrder, setPickupCouriersLoadingByOrder] = useState({});
  const [deliveryCouriersByOrder, setDeliveryCouriersByOrder] = useState({});
  const [deliveryCouriersLoadingByOrder, setDeliveryCouriersLoadingByOrder] = useState({});
  const [pendingAssignments, setPendingAssignments] = useState({});
  const [pendingDeliveryAssignments, setPendingDeliveryAssignments] = useState({});
  const [pendingLinehaulAssignments, setPendingLinehaulAssignments] = useState({});
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [fineType, setFineType] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [fineNotes, setFineNotes] = useState('');
  const [editForm, setEditForm] = useState({
    status: '',
    serviceType: '',
    scheduledDate: '',
    scheduledTime: '',
    declaredWeight: ''
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderViewMode, setOrderViewMode] = useState('active');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');
  const [orderFineFilter, setOrderFineFilter] = useState('all');
  const [incidentHistory, setIncidentHistory] = useState([]);
  const [incidentHistoryLoading, setIncidentHistoryLoading] = useState(false);
  const [incidentHistoryError, setIncidentHistoryError] = useState('');
  const [isFinalCancelOpen, setIsFinalCancelOpen] = useState(false);
  const [finalCancelReason, setFinalCancelReason] = useState('');
  const [finalCancelNotes, setFinalCancelNotes] = useState('');
  const [finalCancelError, setFinalCancelError] = useState('');
  const [finalCancelRefundAction, setFinalCancelRefundAction] = useState('full_refund');
  const [finalCancelRefundAmount, setFinalCancelRefundAmount] = useState('');
  const [finalCancelChecks, setFinalCancelChecks] = useState({
    pickupCompletionConfirmed: false,
    deliveryAttemptFailed: false,
    customerConfirmedCancellation: false
  });
  const [isPrePickupForceCancelOpen, setIsPrePickupForceCancelOpen] = useState(false);
  const [prePickupForceReason, setPrePickupForceReason] = useState('');
  const [prePickupForceNotes, setPrePickupForceNotes] = useState('');
  const [prePickupForceError, setPrePickupForceError] = useState('');
  const [rejectFlow, setRejectFlow] = useState({
    isOpen: false,
    incidentEventId: null,
    type: '',
    trackingLabel: ''
  });
  const [rejectReasonCode, setRejectReasonCode] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [approveIncidentFlow, setApproveIncidentFlow] = useState({
    isOpen: false,
    incidentEventId: null,
    type: '',
    trackingLabel: ''
  });
  const [approveIncidentNotes, setApproveIncidentNotes] = useState('');
  const [approveIncidentError, setApproveIncidentError] = useState('');
  const [isApprovingIncident, setIsApprovingIncident] = useState(false);
  const [approvePickupFlow, setApprovePickupFlow] = useState({
    isOpen: false,
    requestId: null,
    trackingLabel: ''
  });
  const [approvePickupNotes, setApprovePickupNotes] = useState('');
  const [approvePickupError, setApprovePickupError] = useState('');
  const [isApprovingPickup, setIsApprovingPickup] = useState(false);
  const [rejectPickupFlow, setRejectPickupFlow] = useState({
    isOpen: false,
    requestId: null,
    trackingLabel: ''
  });
  const [rejectPickupNotes, setRejectPickupNotes] = useState('');
  const [rejectPickupError, setRejectPickupError] = useState('');
  const [isRejectingPickup, setIsRejectingPickup] = useState(false);
  const [isDeliveredReopenOpen, setIsDeliveredReopenOpen] = useState(false);
  const [deliveredReopenReason, setDeliveredReopenReason] = useState('');
  const [deliveredReopenNotes, setDeliveredReopenNotes] = useState('');
  const [deliveredReopenStatus, setDeliveredReopenStatus] = useState('delivery_attempt_failed');
  const [deliveredReopenError, setDeliveredReopenError] = useState('');
  const [isReopeningDelivered, setIsReopeningDelivered] = useState(false);

  const selectedFine = fineOptions.find((option) => option.value === fineType);

  const statusStyles = {
    created: 'bg-warning/10 text-warning',
    pickup_assigned: 'bg-primary/10 text-primary',
    picked_up: 'bg-primary/10 text-primary',
    in_transit_to_origin_branch: 'bg-primary/10 text-primary',
    received_at_origin_branch: 'bg-success/10 text-success',
    linehaul_assigned: 'bg-primary/10 text-primary',
    linehaul_load_confirmed: 'bg-accent/10 text-accent',
    linehaul_in_transit: 'bg-primary/10 text-primary',
    received_at_destination_branch: 'bg-success/10 text-success',
    delivery_assigned: 'bg-primary/10 text-primary',
    delivery_load_confirmed: 'bg-accent/10 text-accent',
    out_for_delivery: 'bg-primary/10 text-primary',
    delivery_attempt_failed: 'bg-warning/10 text-warning',
    waiting_for_reattempt: 'bg-warning/10 text-warning',
    rts_pending: 'bg-error/10 text-error',
    returned_to_sender: 'bg-error/10 text-error',
    on_hold: 'bg-warning/20 text-warning',
    pending: 'bg-warning/10 text-warning',
    delivered: 'bg-success/10 text-success',
    cancelled: 'bg-error/10 text-error'
  };
  const paymentStatusStyles = {
    pending: 'bg-warning/10 text-warning',
    paid: 'bg-success/10 text-success',
    failed: 'bg-error/10 text-error',
    refunded: 'bg-muted text-muted-foreground'
  };
  const finePaymentStyles = {
    pending: 'bg-warning/10 text-warning',
    applied: 'bg-success/10 text-success',
    waived: 'bg-muted text-muted-foreground'
  };

  const normalizeStatus = (value) => {
    const status = String(value || '').trim().toLowerCase();
    if (status === 'in_transit_to_branch') {
      return 'in_transit_to_origin_branch';
    }
    if (status === 'in_branch_origin') {
      return 'received_at_origin_branch';
    }
    if (status === 'in_branch_destination') {
      return 'received_at_destination_branch';
    }
    return status;
  };

  const loadOrders = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/orders'));
      if (!res.ok) {
        throw new Error('Failed to load orders');
      }
      const data = await res.json();
      const normalizedOrders = (data?.orders || []).map((order) => ({
        ...order,
        status: normalizeStatus(order?.status),
        displayStatus: normalizeStatus(order?.displayStatus || order?.status)
      }));
      setOrders(normalizedOrders);
      setPickupCouriersByOrder({});
      setPickupCouriersLoadingByOrder({});
      setDeliveryCouriersByOrder({});
      setDeliveryCouriersLoadingByOrder({});
    } catch (err) {
      setError('Unable to load orders right now.');
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCouriers = async () => {
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/couriers'));
      if (!res.ok) {
        throw new Error('Failed to load couriers');
      }
      const data = await res.json();
      setCouriers(data?.couriers || []);
    } catch (err) {
      setCouriers([]);
      setError('Unable to load couriers right now.');
    }
  };

  useEffect(() => {
    loadOrders();
    loadCouriers();
  }, []);

  useEffect(() => {
    const bookingId = Number(selectedOrder?.id);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      setIncidentHistory([]);
      setIncidentHistoryError('');
      closeRejectFlow();
      closeApproveIncidentFlow();
      setIsPrePickupForceCancelOpen(false);
      setPrePickupForceReason('');
      setPrePickupForceNotes('');
      setPrePickupForceError('');
      closeApprovePickupFlow();
      closeRejectPickupFlow();
      handleCloseDeliveredReopen();
      return;
    }
    loadIncidentHistory(bookingId);
  }, [selectedOrder?.id]);

  const clearFineForm = () => {
    setSelectedOrder(null);
    setFineType('');
    setFineAmount('');
    setFineNotes('');
    setIncidentHistory([]);
    setIncidentHistoryError('');
    setIncidentHistoryLoading(false);
    setEditForm({
      status: '',
      serviceType: '',
      scheduledDate: '',
      scheduledTime: '',
      declaredWeight: ''
    });
    closeRejectFlow();
    closeApproveIncidentFlow();
    setIsPrePickupForceCancelOpen(false);
    setPrePickupForceReason('');
    setPrePickupForceNotes('');
    setPrePickupForceError('');
    closeApprovePickupFlow();
    closeRejectPickupFlow();
    handleCloseDeliveredReopen();
  };

  const selectOrder = (order) => {
    setIsFinalCancelOpen(false);
    setIsPrePickupForceCancelOpen(false);
    setFinalCancelError('');
    setPrePickupForceError('');
    closeApproveIncidentFlow();
    closeApprovePickupFlow();
    closeRejectPickupFlow();
    handleCloseDeliveredReopen();
    setSelectedOrder(order);
    setError('');
    setEditForm({
      status: order?.status || '',
      serviceType: order?.serviceType || '',
      scheduledDate: order?.scheduledDate || '',
      scheduledTime: order?.scheduledTime || '',
      declaredWeight: order?.declaredWeight ?? ''
    });
  };

  const loadIncidentHistory = async (orderId) => {
    const bookingId = Number(orderId);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      setIncidentHistory([]);
      setIncidentHistoryError('');
      return;
    }
    setIncidentHistoryLoading(true);
    setIncidentHistoryError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/incident-history`));
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load cancellation history');
      }
      const payload = await res.json();
      setIncidentHistory(Array.isArray(payload?.history) ? payload.history : []);
    } catch (err) {
      setIncidentHistory([]);
      setIncidentHistoryError(err?.message || 'Unable to load cancellation history right now.');
    } finally {
      setIncidentHistoryLoading(false);
    }
  };

  const openRejectFlow = (entry) => {
    const incidentEventId = Number(entry?.sourceId);
    if (!Number.isFinite(incidentEventId) || incidentEventId <= 0) {
      return;
    }
    setRejectFlow({
      isOpen: true,
      incidentEventId,
      type: String(entry?.type || '').trim().toLowerCase(),
      trackingLabel: String(selectedOrder?.code || '').trim()
    });
    setRejectReasonCode('');
    setRejectNotes('');
    setRejectError('');
  };

  const closeRejectFlow = () => {
    setRejectFlow({
      isOpen: false,
      incidentEventId: null,
      type: '',
      trackingLabel: ''
    });
    setRejectReasonCode('');
    setRejectNotes('');
    setRejectError('');
    setIsRejecting(false);
  };

  const openApproveIncidentFlow = (entry) => {
    const incidentEventId = Number(entry?.sourceId);
    if (!Number.isFinite(incidentEventId) || incidentEventId <= 0) {
      return;
    }
    const type = String(entry?.type || '').trim().toLowerCase();
    setApproveIncidentFlow({
      isOpen: true,
      incidentEventId,
      type,
      trackingLabel: String(selectedOrder?.code || '').trim()
    });
    setApproveIncidentNotes('');
    setApproveIncidentError('');
  };

  const closeApproveIncidentFlow = () => {
    setApproveIncidentFlow({
      isOpen: false,
      incidentEventId: null,
      type: '',
      trackingLabel: ''
    });
    setApproveIncidentNotes('');
    setApproveIncidentError('');
    setIsApprovingIncident(false);
  };

  const submitApproveIncidentFlow = async () => {
    const bookingId = Number(selectedOrder?.id);
    const incidentEventId = Number(approveIncidentFlow?.incidentEventId);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !Number.isFinite(incidentEventId) || incidentEventId <= 0) {
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setApproveIncidentError('Admin session not found. Please sign in again.');
      return;
    }

    setIsApprovingIncident(true);
    setApproveIncidentError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/incident-decision`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentEventId,
          decision: 'approved',
          notes: approveIncidentNotes,
          adminId
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to approve request');
      }
      const data = await res.json();
      const nextStatus = String(data?.booking?.status || '').trim();
      if (nextStatus) {
        setOrders((previous) => (
          (previous || []).map((order) => (
            Number(order?.id) === bookingId
              ? { ...order, status: nextStatus }
              : order
          ))
        ));
        setSelectedOrder((previous) => (
          previous && Number(previous?.id) === bookingId
            ? { ...previous, status: nextStatus }
            : previous
        ));
        setEditForm((previous) => ({ ...previous, status: nextStatus }));
      }
      closeApproveIncidentFlow();
      loadIncidentHistory(bookingId);
    } catch (err) {
      setApproveIncidentError(err?.message || 'Unable to approve request right now.');
    } finally {
      setIsApprovingIncident(false);
    }
  };

  const submitRejectFlow = async () => {
    const bookingId = Number(selectedOrder?.id);
    const incidentEventId = Number(rejectFlow?.incidentEventId);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !Number.isFinite(incidentEventId) || incidentEventId <= 0) {
      return;
    }
    if (!rejectReasonCode) {
      setRejectError('Select a rejection reason.');
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setRejectError('Admin session not found. Please sign in again.');
      return;
    }

    setIsRejecting(true);
    setRejectError('');
    try {
      const reasonText = findReasonLabel(ADMIN_INCIDENT_REJECTION_REASONS, rejectReasonCode) || rejectReasonCode;
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/incident-decision`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentEventId,
          decision: 'rejected',
          reasonCode: rejectReasonCode,
          reasonText,
          notes: rejectNotes,
          adminId
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to reject request');
      }
      closeRejectFlow();
      loadIncidentHistory(bookingId);
    } catch (err) {
      setRejectError(err?.message || 'Unable to reject request right now.');
    } finally {
      setIsRejecting(false);
    }
  };

  const openApprovePickupFlow = (entry) => {
    const requestId = Number(entry?.sourceId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return;
    }
    setApprovePickupFlow({
      isOpen: true,
      requestId,
      trackingLabel: String(selectedOrder?.code || '').trim()
    });
    setApprovePickupNotes('');
    setApprovePickupError('');
  };

  const closeApprovePickupFlow = () => {
    setApprovePickupFlow({
      isOpen: false,
      requestId: null,
      trackingLabel: ''
    });
    setApprovePickupNotes('');
    setApprovePickupError('');
    setIsApprovingPickup(false);
  };

  const submitApprovePickupFlow = async () => {
    const bookingId = Number(selectedOrder?.id);
    const requestId = Number(approvePickupFlow?.requestId);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !Number.isFinite(requestId) || requestId <= 0) {
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setApprovePickupError('Admin session not found. Please sign in again.');
      return;
    }

    setIsApprovingPickup(true);
    setApprovePickupError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/pickup-cancellation/${requestId}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          adminNote: approvePickupNotes || null
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to approve pickup cancellation');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          Number(order?.id) === bookingId
            ? { ...order, status: data?.booking?.status || 'cancelled' }
            : order
        )
      );
      setSelectedOrder((prev) => (
        prev && Number(prev?.id) === bookingId
          ? { ...prev, status: data?.booking?.status || 'cancelled' }
          : prev
      ));
      setEditForm((prev) => ({ ...prev, status: data?.booking?.status || 'cancelled' }));
      closeApprovePickupFlow();
      loadIncidentHistory(bookingId);
    } catch (err) {
      setApprovePickupError(err?.message || 'Unable to approve pickup cancellation right now.');
    } finally {
      setIsApprovingPickup(false);
    }
  };

  const openRejectPickupFlow = (entry) => {
    const requestId = Number(entry?.sourceId);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return;
    }
    setRejectPickupFlow({
      isOpen: true,
      requestId,
      trackingLabel: String(selectedOrder?.code || '').trim()
    });
    setRejectPickupNotes('');
    setRejectPickupError('');
  };

  const closeRejectPickupFlow = () => {
    setRejectPickupFlow({
      isOpen: false,
      requestId: null,
      trackingLabel: ''
    });
    setRejectPickupNotes('');
    setRejectPickupError('');
    setIsRejectingPickup(false);
  };

  const submitRejectPickupFlow = async () => {
    const bookingId = Number(selectedOrder?.id);
    const requestId = Number(rejectPickupFlow?.requestId);
    if (!Number.isFinite(bookingId) || bookingId <= 0 || !Number.isFinite(requestId) || requestId <= 0) {
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setRejectPickupError('Admin session not found. Please sign in again.');
      return;
    }

    setIsRejectingPickup(true);
    setRejectPickupError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/pickup-cancellation/${requestId}/reject`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          adminNote: rejectPickupNotes || null
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to reject pickup cancellation');
      }
      closeRejectPickupFlow();
      loadIncidentHistory(bookingId);
    } catch (err) {
      setRejectPickupError(err?.message || 'Unable to reject pickup cancellation right now.');
    } finally {
      setIsRejectingPickup(false);
    }
  };

  const openOrderChat = (order, recipientRole) => {
    if (typeof onOpenChat !== 'function') {
      return;
    }
    const bookingId = Number(order?.id);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    if (recipientRole === 'customer') {
      const customerId = Number(order?.customerId);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return;
      }
      onOpenChat({
        bookingId,
        bookingCode: order?.code,
        recipientId: customerId,
        recipientRole: 'customer',
        recipientLabel: order?.customer || 'Customer'
      });
      return;
    }
    const courierId = Number(order?.courierId);
    if (!Number.isFinite(courierId) || courierId <= 0) {
      return;
    }
    onOpenChat({
      bookingId,
      bookingCode: order?.code,
      recipientId: courierId,
      recipientRole: 'courier',
      recipientLabel: order?.courier || 'Courier'
    });
  };

  const handleApplyFine = async () => {
    if (!selectedOrder || !fineType) {
      return;
    }
    if (!canIssueFineForOrder(selectedOrder)) {
      setError(getFineIssueBlockReason(selectedOrder) || 'Fine cannot be issued for current status.');
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setError('Admin session not found. Please sign in again.');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/fines'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: selectedOrder?.id,
          adminId,
          errorType: fineType,
          fineAmount: fineAmount ? Number(fineAmount) : 0,
          notes: fineNotes
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to apply fine');
      }
      const payload = await res.json().catch(() => ({}));
      const hasBookingPayload = Boolean(payload?.booking && typeof payload.booking === 'object');
      const hasDeliveryCourierIdUpdate = hasBookingPayload
        && Object.prototype.hasOwnProperty.call(payload.booking, 'deliveryCourierId');
      const hasCourierIdUpdate = hasBookingPayload
        && Object.prototype.hasOwnProperty.call(payload.booking, 'courierId');
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === selectedOrder?.id
            ? {
                ...order,
                status: payload?.booking?.status || order?.status,
                ...(hasCourierIdUpdate
                  ? {
                      courierId: payload.booking.courierId,
                      courier: payload.booking.courierId ? order?.courier : 'Unassigned'
                    }
                  : {}),
                ...(hasDeliveryCourierIdUpdate
                  ? {
                      deliveryCourierId: payload.booking.deliveryCourierId,
                      deliveryCourier: payload.booking.deliveryCourierId ? order?.deliveryCourier : 'Unassigned'
                    }
                  : {}),
                fineStatus: payload?.fine?.status || 'pending',
                isOnHold: true,
                displayStatus: 'on_hold',
                latestFine: payload?.fine
                  ? {
                      id: payload.fine.id,
                      status: payload.fine.status,
                      errorType: payload.fine.errorType,
                      errorLabel: payload.fine.errorLabel,
                      amount: payload.fine.amount,
                      notes: payload.fine.notes || null
                    }
                  : order?.latestFine,
                flagged: true
              }
            : order
        )
      );
      clearFineForm();
    } catch (err) {
      setError(err?.message || 'Unable to apply fine right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssignCourier = async (orderId) => {
    const courierId = pendingAssignments?.[orderId];
    if (!courierId) {
      return;
    }
    setIsAssigning(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${orderId}/assign`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId })
      });
      if (!res.ok) {
        throw new Error('Failed to assign courier');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === orderId
            ? {
                ...order,
                courierId: data?.booking?.courierId ?? courierId,
                courier: data?.booking?.courierName || order?.courier,
                pickupCourierId: data?.booking?.courierId ?? courierId,
                pickupCourier: data?.booking?.courierName || order?.pickupCourier || order?.courier,
                status: data?.booking?.status || order?.status
              }
            : order
        )
      );
      setPendingAssignments((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (err) {
      setError('Unable to assign courier right now.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignCourier = async (orderId) => {
    setIsAssigning(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${orderId}/assign`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId: null })
      });
      if (!res.ok) {
        throw new Error('Failed to unassign courier');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === orderId
            ? {
                ...order,
                courierId: data?.booking?.courierId ?? null,
                courier: data?.booking?.courierName || 'Unassigned',
                pickupCourierId: null,
                pickupCourier: 'Unassigned',
                status: data?.booking?.status || order?.status
              }
            : order
        )
      );
    } catch (err) {
      setError('Unable to unassign courier right now.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAssignDelivery = async (orderId) => {
    const courierId = pendingDeliveryAssignments?.[orderId];
    if (!courierId) {
      return;
    }
    setIsAssigning(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${orderId}/assign-delivery`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to assign delivery courier');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === orderId
            ? {
                ...order,
                courierId: data?.booking?.courierId ?? courierId,
                courier: data?.booking?.courierName || order?.courier,
                deliveryCourierId: data?.booking?.courierId ?? courierId,
                deliveryCourier: data?.booking?.courierName || order?.deliveryCourier,
                status: data?.booking?.status || order?.status
              }
            : order
        )
      );
      setPendingDeliveryAssignments((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Unable to assign delivery courier right now.');
    } finally {
      setIsAssigning(false);
    }
  };

  const loadPickupCouriers = async (orderId) => {
    const safeOrderId = Number(orderId);
    if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) {
      return;
    }
    if (pickupCouriersLoadingByOrder?.[safeOrderId]) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(pickupCouriersByOrder, safeOrderId)) {
      return;
    }

    setPickupCouriersLoadingByOrder((prev) => ({ ...prev, [safeOrderId]: true }));
    try {
      const params = new URLSearchParams({
        stage: 'pickup',
        bookingId: String(safeOrderId)
      });
      const res = await fetch(buildApiUrl(`/api/admin/couriers?${params.toString()}`));
      if (!res.ok) {
        throw new Error('Failed to load pickup couriers');
      }
      const data = await res.json();
      setPickupCouriersByOrder((prev) => ({
        ...prev,
        [safeOrderId]: data?.couriers || []
      }));
    } catch (err) {
      setError('Unable to load pickup couriers right now.');
    } finally {
      setPickupCouriersLoadingByOrder((prev) => ({ ...prev, [safeOrderId]: false }));
    }
  };

  const loadDeliveryCouriers = async (orderId) => {
    const safeOrderId = Number(orderId);
    if (!Number.isFinite(safeOrderId) || safeOrderId <= 0) {
      return;
    }
    if (deliveryCouriersLoadingByOrder?.[safeOrderId]) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(deliveryCouriersByOrder, safeOrderId)) {
      return;
    }

    setDeliveryCouriersLoadingByOrder((prev) => ({ ...prev, [safeOrderId]: true }));
    try {
      const params = new URLSearchParams({
        stage: 'delivery',
        bookingId: String(safeOrderId)
      });
      const res = await fetch(buildApiUrl(`/api/admin/couriers?${params.toString()}`));
      if (!res.ok) {
        throw new Error('Failed to load delivery couriers');
      }
      const data = await res.json();
      setDeliveryCouriersByOrder((prev) => ({
        ...prev,
        [safeOrderId]: data?.couriers || []
      }));
    } catch (err) {
      setError('Unable to load delivery couriers right now.');
    } finally {
      setDeliveryCouriersLoadingByOrder((prev) => ({ ...prev, [safeOrderId]: false }));
    }
  };

  const handleAssignLinehaul = async (orderId) => {
    const courierId = pendingLinehaulAssignments?.[orderId];
    if (!courierId) {
      return;
    }
    setIsAssigning(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/admin/orders/${orderId}/assign-linehaul`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to assign linehaul courier');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === orderId
            ? {
                ...order,
                courierId: data?.booking?.courierId ?? courierId,
                courier: data?.booking?.courierName || order?.courier,
                linehaulCourierId: data?.booking?.courierId ?? courierId,
                linehaulCourier: data?.booking?.courierName || order?.linehaulCourier,
                status: data?.booking?.status || order?.status
              }
            : order
        )
      );
      setPendingLinehaulAssignments((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } catch (err) {
      setError(err?.message || 'Unable to assign linehaul courier right now.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleConfirmBranchReceipt = async (order, stage) => {
    const orderId = Number(order?.id);
    if (!Number.isFinite(orderId) || !['origin', 'destination'].includes(stage)) {
      return;
    }
    setIsAssigning(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl(`/api/orders/${orderId}/branch/confirm-receipt`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          actorType: 'admin',
          description: stage === 'origin'
            ? 'Origin branch receipt confirmed by admin'
            : 'Destination branch receipt confirmed by admin'
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to confirm branch receipt');
      }

      const data = await res.json();
      const nextStatus = normalizeStatus(
        data?.booking?.status || (stage === 'origin' ? 'received_at_origin_branch' : 'received_at_destination_branch')
      );

      setOrders((prev) =>
        prev.map((item) => {
          if (Number(item?.id) !== orderId) {
            return item;
          }
          const updated = { ...item, status: nextStatus };
          const autoAssignment = data?.autoAssignment;
          if (autoAssignment?.assigned) {
            const assignedCourierId = Number(autoAssignment?.courierId);
            const assignedCourierName = autoAssignment?.courierName || '';
            if (nextStatus === 'linehaul_assigned' && Number.isFinite(assignedCourierId)) {
              updated.courierId = assignedCourierId;
              updated.courier = assignedCourierName || updated.courier;
              updated.linehaulCourierId = assignedCourierId;
              updated.linehaulCourier = assignedCourierName || updated.linehaulCourier;
            } else if (nextStatus === 'delivery_assigned' && Number.isFinite(assignedCourierId)) {
              updated.courierId = assignedCourierId;
              updated.courier = assignedCourierName || updated.courier;
              updated.deliveryCourierId = assignedCourierId;
              updated.deliveryCourier = assignedCourierName || updated.deliveryCourier;
            }
          }
          return updated;
        })
      );

      setSelectedOrder((prev) => (
        prev && Number(prev?.id) === orderId
          ? { ...prev, status: nextStatus }
          : prev
      ));
      setEditForm((prev) => (
        selectedOrder && Number(selectedOrder?.id) === orderId
          ? { ...prev, status: nextStatus }
          : prev
      ));
    } catch (err) {
      setError(err?.message || 'Unable to confirm branch receipt right now.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUpdateBooking = async () => {
    if (!selectedOrder) {
      return;
    }
    const normalizedWeight = String(editForm?.declaredWeight ?? '').trim();
    if (normalizedWeight !== '') {
      const parsedWeight = Number(normalizedWeight);
      if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
        setError('Declared weight must be a valid number greater than or equal to 0.');
        return;
      }
    }
    setIsSaving(true);
    setError('');
    try {
      const requestPayload = {
        status: editForm.status,
        serviceType: editForm.serviceType,
        scheduledDate: editForm.scheduledDate || null,
        scheduledTime: editForm.scheduledTime || null
      };
      if (normalizedWeight !== '') {
        requestPayload.declaredWeight = normalizedWeight;
      }
      const res = await fetch(buildApiUrl(`/api/admin/orders/${selectedOrder.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to update booking');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === selectedOrder?.id
            ? {
                ...order,
                status: data?.booking?.status || order?.status,
                displayStatus: order?.isOnHold
                  ? 'on_hold'
                  : (data?.booking?.status || order?.status),
                serviceType: data?.booking?.serviceType || order?.serviceType,
                scheduledDate: data?.booking?.scheduledDate ?? order?.scheduledDate,
                scheduledTime: data?.booking?.scheduledTime ?? order?.scheduledTime,
                declaredWeight: data?.booking?.declaredWeight ?? order?.declaredWeight
              }
            : order
        )
      );
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              status: data?.booking?.status || prev?.status,
              displayStatus: prev?.isOnHold
                ? 'on_hold'
                : (data?.booking?.status || prev?.status),
              serviceType: data?.booking?.serviceType || prev?.serviceType,
              scheduledDate: data?.booking?.scheduledDate ?? prev?.scheduledDate,
              scheduledTime: data?.booking?.scheduledTime ?? prev?.scheduledTime,
              declaredWeight: data?.booking?.declaredWeight ?? prev?.declaredWeight
            }
          : prev
      );
      setEditForm((prev) => ({
        ...prev,
        declaredWeight: data?.booking?.declaredWeight ?? prev?.declaredWeight
      }));
    } catch (err) {
      setError(err?.message || 'Unable to update booking right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetDeliveredReopenForm = () => {
    setDeliveredReopenReason('');
    setDeliveredReopenNotes('');
    setDeliveredReopenStatus('delivery_attempt_failed');
    setDeliveredReopenError('');
    setIsReopeningDelivered(false);
  };

  const handleCloseDeliveredReopen = () => {
    setIsDeliveredReopenOpen(false);
    resetDeliveredReopenForm();
  };

  const handleOpenDeliveredReopen = () => {
    if (!selectedOrder) {
      return;
    }
    if (normalizeStatus(selectedOrder?.status) !== 'delivered') {
      setError('Only delivered orders can be reopened.');
      return;
    }
    setError('');
    resetDeliveredReopenForm();
    setIsDeliveredReopenOpen(true);
  };

  const handleSubmitDeliveredReopen = async () => {
    const bookingId = Number(selectedOrder?.id);
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setDeliveredReopenError('Admin session not found. Please sign in again.');
      return;
    }
    const reasonCode = String(deliveredReopenReason || '').trim().toLowerCase();
    const notes = String(deliveredReopenNotes || '').trim();
    const targetStatus = String(deliveredReopenStatus || '').trim().toLowerCase();
    if (!reasonCode) {
      setDeliveredReopenError('Select a reopen reason.');
      return;
    }
    if (!targetStatus) {
      setDeliveredReopenError('Select a target status.');
      return;
    }
    if (!notes) {
      setDeliveredReopenError('Admin notes are required for delivered reopen.');
      return;
    }

    setIsReopeningDelivered(true);
    setDeliveredReopenError('');
    try {
      const reasonText = deliveredReopenReasonOptions.find((option) => option?.value === reasonCode)?.label || reasonCode;
      const res = await fetch(buildApiUrl(`/api/admin/orders/${bookingId}/reopen-delivered`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          reasonCode,
          reasonText,
          notes,
          targetStatus
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to reopen delivered order');
      }

      const data = await res.json();
      const nextStatus = normalizeStatus(data?.booking?.status || targetStatus);
      setOrders((prev) => prev.map((order) => (
        Number(order?.id) === bookingId
          ? { ...order, status: nextStatus }
          : order
      )));
      setSelectedOrder((prev) => (
        prev && Number(prev?.id) === bookingId
          ? { ...prev, status: nextStatus }
          : prev
      ));
      setEditForm((prev) => ({
        ...prev,
        status: nextStatus
      }));
      handleCloseDeliveredReopen();
      loadIncidentHistory(bookingId);
    } catch (err) {
      setDeliveredReopenError(err?.message || 'Unable to reopen delivered order right now.');
    } finally {
      setIsReopeningDelivered(false);
    }
  };

  const resetFinalCancelForm = () => {
    setFinalCancelReason('');
    setFinalCancelNotes('');
    setFinalCancelError('');
    setFinalCancelRefundAction('full_refund');
    setFinalCancelRefundAmount('');
    setFinalCancelChecks({
      pickupCompletionConfirmed: false,
      deliveryAttemptFailed: false,
      customerConfirmedCancellation: false
    });
  };

  const resetPrePickupForceCancelForm = () => {
    setPrePickupForceReason('');
    setPrePickupForceNotes('');
    setPrePickupForceError('');
  };

  const canOpenPrePickupForceCancelForOrder = (order) => (
    ['created', 'pickup_assigned'].includes(normalizeStatus(order?.status))
  );

  const getPrePickupForceCancelBlockReason = (order) => {
    const status = normalizeStatus(order?.status);
    if (!status) {
      return 'Select an order to continue.';
    }
    if (status === 'cancelled') {
      return 'This order is already cancelled.';
    }
    if (status === 'delivered') {
      return 'Delivered orders cannot be cancelled.';
    }
    if (!['created', 'pickup_assigned'].includes(status)) {
      return 'Force pre-pickup cancellation is allowed only while status is Created or Pickup Assigned.';
    }
    return '';
  };

  const handleOpenPrePickupForceCancel = () => {
    if (!selectedOrder) {
      return;
    }
    const blockReason = getPrePickupForceCancelBlockReason(selectedOrder);
    if (blockReason) {
      setError(blockReason);
      return;
    }
    setError('');
    resetPrePickupForceCancelForm();
    setIsPrePickupForceCancelOpen(true);
  };

  const handleClosePrePickupForceCancel = () => {
    setIsPrePickupForceCancelOpen(false);
    resetPrePickupForceCancelForm();
  };

  const isPickupCompletedStatus = (statusValue) => (
    [
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
    ].includes(normalizeStatus(statusValue))
  );

  const canOpenFinalCancelForOrder = (order) => {
    const status = normalizeStatus(order?.status);
    if (!status || status === 'delivered' || status === 'cancelled') {
      return false;
    }
    return isPickupCompletedStatus(status);
  };

  const getFinalCancelBlockReason = (order) => {
    const status = normalizeStatus(order?.status);
    if (!status) {
      return 'Select an order to continue.';
    }
    if (status === 'cancelled') {
      return 'This order is already cancelled.';
    }
    if (status === 'delivered') {
      return 'Delivered orders cannot be cancelled.';
    }
    if (!isPickupCompletedStatus(status)) {
      return 'Final cancellation unlocks only after pickup completion.';
    }
    return '';
  };

  const handleOpenFinalCancel = () => {
    if (!selectedOrder) {
      return;
    }
    const blockReason = getFinalCancelBlockReason(selectedOrder);
    if (blockReason) {
      setError(blockReason);
      return;
    }
    setError('');
    resetFinalCancelForm();
    setIsFinalCancelOpen(true);
  };

  const handleCloseFinalCancel = () => {
    setIsFinalCancelOpen(false);
    resetFinalCancelForm();
  };

  const handlePrePickupForceCancelBooking = async () => {
    if (!selectedOrder) {
      return;
    }
    if (!canOpenPrePickupForceCancelForOrder(selectedOrder)) {
      setPrePickupForceError('This order is not eligible for pre-pickup force cancellation.');
      return;
    }
    if (!prePickupForceReason) {
      setPrePickupForceError('Select a cancellation reason.');
      return;
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setPrePickupForceError('Admin session not found. Please sign in again.');
      return;
    }

    setIsSaving(true);
    setPrePickupForceError('');
    setError('');
    try {
      const reasonLabel = findReasonLabel(ADMIN_PRE_PICKUP_FORCE_CANCELLATION_REASONS, prePickupForceReason) || prePickupForceReason;
      const res = await fetch(buildApiUrl(`/api/admin/orders/${selectedOrder.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellationMode: 'pre_pickup_force',
          cancellationReasonCode: prePickupForceReason,
          cancellationReasonText: reasonLabel,
          cancellationNotes: prePickupForceNotes,
          adminId
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to force cancel booking');
      }
      await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === selectedOrder?.id
            ? { ...order, status: 'cancelled' }
            : order
        )
      );
      setSelectedOrder((prev) => (
        prev
          ? { ...prev, status: 'cancelled' }
          : prev
      ));
      setEditForm((prev) => ({ ...prev, status: 'cancelled' }));
      setIsPrePickupForceCancelOpen(false);
      resetPrePickupForceCancelForm();
      loadIncidentHistory(selectedOrder?.id);
    } catch (err) {
      setPrePickupForceError(err?.message || 'Unable to force cancel booking right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalCancelBooking = async () => {
    if (!selectedOrder) {
      return;
    }
    if (!canOpenFinalCancelForOrder(selectedOrder)) {
      setFinalCancelError('This order is not eligible for final cancellation.');
      return;
    }
    if (!finalCancelReason) {
      setFinalCancelError('Select a cancellation reason.');
      return;
    }
    if (!finalCancelChecks.pickupCompletionConfirmed
      || !finalCancelChecks.deliveryAttemptFailed
      || !finalCancelChecks.customerConfirmedCancellation) {
      setFinalCancelError('All confirmation checks are required.');
      return;
    }
    if (finalCancelRefundAction === 'partial_refund') {
      const amount = Number(finalCancelRefundAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFinalCancelError('Enter a valid partial refund amount.');
        return;
      }
    }
    const adminId = Number(localStorage.getItem('userId'));
    if (!Number.isFinite(adminId) || adminId <= 0) {
      setFinalCancelError('Admin session not found. Please sign in again.');
      return;
    }

    setIsSaving(true);
    setFinalCancelError('');
    setError('');
    try {
      const reasonLabel = findReasonLabel(ADMIN_FINAL_CANCELLATION_REASONS, finalCancelReason) || finalCancelReason;
      const res = await fetch(buildApiUrl(`/api/admin/orders/${selectedOrder.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cancelled',
          cancellationMode: 'final',
          cancellationReasonCode: finalCancelReason,
          cancellationReasonText: reasonLabel,
          cancellationNotes: finalCancelNotes,
          pickupCompletionConfirmed: finalCancelChecks.pickupCompletionConfirmed,
          deliveryAttemptFailed: finalCancelChecks.deliveryAttemptFailed,
          customerConfirmedCancellation: finalCancelChecks.customerConfirmedCancellation,
          refundAction: finalCancelRefundAction,
          refundAmount: finalCancelRefundAction === 'partial_refund' ? Number(finalCancelRefundAmount) : null,
          adminId
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to cancel booking');
      }
      const data = await res.json();
      setOrders((prev) =>
        prev.map((order) =>
          order?.id === selectedOrder?.id
            ? {
                ...order,
                status: data?.booking?.status || 'cancelled',
                paymentStatus: data?.refund?.paymentStatus || order?.paymentStatus
              }
            : order
        )
      );
      setSelectedOrder((prev) => (
        prev
          ? {
              ...prev,
              status: 'cancelled',
              paymentStatus: data?.refund?.paymentStatus || prev?.paymentStatus
            }
          : prev
      ));
      setEditForm((prev) => ({ ...prev, status: 'cancelled' }));
      setIsFinalCancelOpen(false);
      resetFinalCancelForm();
      loadIncidentHistory(selectedOrder?.id);
    } catch (err) {
      setFinalCancelError(err?.message || 'Unable to cancel booking right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatWeight = (value) => {
    if (value === null || value === undefined || value === '') {
      return 'N/A';
    }
    return `${value} kg`;
  };

  const formatStatus = (status) => {
    const normalized = normalizeStatus(status);
    if (normalized === 'on_hold') {
      return 'On Hold';
    }
    if (normalized === 'received_at_origin_branch') {
      return 'In Branch (Origin)';
    }
    if (normalized === 'linehaul_load_confirmed') {
      return 'Linehaul Load Confirmed';
    }
    if (normalized === 'received_at_destination_branch') {
      return 'In Branch (Destination)';
    }
    if (normalized === 'delivery_load_confirmed') {
      return 'Delivery Load Confirmed';
    }
    return normalized.replace(/_/g, ' ');
  };

  const formatPaymentMethod = (method, provider) => {
    const normalizedMethod = String(method || '').trim().toLowerCase();
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!normalizedMethod) {
      return 'N/A';
    }
    if (normalizedMethod === 'cash') {
      return 'Cash on Pickup';
    }
    if (normalizedMethod === 'wallet') {
      if (normalizedProvider === 'khalti') {
        return 'Khalti Wallet';
      }
      return normalizedProvider
        ? `Wallet (${normalizedProvider.replace(/-/g, ' ')})`
        : 'Wallet';
    }
    return normalizedMethod.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatPaymentStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return 'N/A';
    }
    if (normalized === 'paid') {
      return 'Paid';
    }
    if (normalized === 'pending') {
      return 'Pending';
    }
    if (normalized === 'failed') {
      return 'Failed';
    }
    if (normalized === 'refunded') {
      return 'Refunded';
    }
    return normalized.replace(/_/g, ' ');
  };

  const formatFineStatus = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') {
      return 'N/A';
    }
    if (normalized === 'pending') {
      return 'Pending';
    }
    if (normalized === 'applied') {
      return 'Paid';
    }
    if (normalized === 'waived') {
      return 'Waived';
    }
    return normalized.replace(/_/g, ' ');
  };

  const getDisplayStatusCode = (order) => (
    Boolean(order?.isOnHold)
      ? 'on_hold'
      : normalizeStatus(order?.status)
  );

  const formatIncidentTime = (value) => {
    if (!value) {
      return 'Unknown time';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }
    return parsed.toLocaleString();
  };

  const incidentTypeStyles = {
    pickup_cancellation: 'bg-error/10 text-error',
    delivery_cancellation: 'bg-error/10 text-error',
    delivery_failure: 'bg-warning/10 text-warning',
    pre_pickup_force_cancellation: 'bg-error/15 text-error',
    final_cancellation: 'bg-error/15 text-error',
    incident_request_rejected: 'bg-muted text-muted-foreground',
    incident_request_approved: 'bg-success/10 text-success'
  };

  const incidentDecisionStyles = {
    pending: 'bg-warning/10 text-warning',
    rejected: 'bg-error/10 text-error',
    approved: 'bg-success/10 text-success',
    accepted: 'bg-success/10 text-success'
  };

  const formatActorLabel = (entry) => {
    const actorName = String(entry?.actorName || '').trim();
    if (actorName) {
      return actorName;
    }
    const actorType = String(entry?.actorType || '').trim().toLowerCase();
    if (!actorType) {
      return 'System';
    }
    return actorType.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const finalCancelBlockReason = getFinalCancelBlockReason(selectedOrder);
  const canOpenFinalCancel = finalCancelBlockReason === '';
  const prePickupForceCancelBlockReason = getPrePickupForceCancelBlockReason(selectedOrder);
  const canOpenPrePickupForceCancel = prePickupForceCancelBlockReason === '';
  const fineIssueBlockReason = getFineIssueBlockReason(selectedOrder);
  const canIssueFine = fineIssueBlockReason === '';

  const canAssignPickup = (status) => ['created', 'pickup_assigned'].includes(normalizeStatus(status));
  const canAssignLinehaul = (order) =>
    Boolean(order?.isIntercity) && normalizeStatus(order?.status) === 'received_at_origin_branch';
  const canAssignDelivery = (order) => {
    if (Boolean(order?.isOnHold)) {
      return false;
    }
    const status = normalizeStatus(order?.status);
    if (status === 'delivery_assigned' || status === 'waiting_for_reattempt') {
      return true;
    }
    return Boolean(order?.isIntercity)
      ? status === 'received_at_destination_branch'
      : status === 'received_at_origin_branch';
  };
  const canConfirmOriginReceipt = (order) => normalizeStatus(order?.status) === 'in_transit_to_origin_branch';
  const canConfirmDestinationReceipt = (order) =>
    Boolean(order?.isIntercity) && normalizeStatus(order?.status) === 'linehaul_in_transit';
  const getActiveAssignmentLeg = (order) => {
    const status = normalizeStatus(order?.status);
    if (['created', 'pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'].includes(status)) {
      return 'pickup';
    }
    if (status === 'received_at_origin_branch') {
      return Boolean(order?.isIntercity) ? 'linehaul' : 'delivery';
    }
    if (['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'].includes(status)) {
      return 'linehaul';
    }
    if (status === 'received_at_destination_branch') {
      return 'delivery';
    }
    if (['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender'].includes(status)) {
      return 'delivery';
    }
    if (status === 'delivered' || status === 'cancelled') {
      return 'closed';
    }
    return 'pickup';
  };

  const assignmentLockCopy = (order, activeLeg) => {
    const status = normalizeStatus(order?.status);
    if (Boolean(order?.isOnHold)) {
      return {
        title: 'Order is on hold due to pending fine payment. Delivery assignment is blocked.',
        text: 'Assignment blocked (on hold)'
      };
    }
    if (status === 'delivered') {
      return {
        title: 'Parcel is delivered. Assignment is closed.',
        text: 'Assignment closed (delivered)'
      };
    }
    if (status === 'cancelled') {
      return {
        title: 'Booking is cancelled. Assignment is closed.',
        text: 'Assignment closed (cancelled)'
      };
    }

    if (activeLeg === 'pickup') {
      if (status === 'picked_up') {
        return {
          title: 'Pickup is confirmed and parcel is with pickup courier.',
          text: 'Pickup in progress'
        };
      }
      if (status === 'in_transit_to_origin_branch') {
        return {
          title: 'Parcel is in transit to origin branch. Confirm origin receipt to unlock next assignment.',
          text: 'Awaiting origin branch receipt'
        };
      }
      return {
        title: 'Pickup assignment is editable only in Created or Pickup Assigned status.',
        text: 'Pickup assignment locked'
      };
    }

    if (activeLeg === 'linehaul') {
      if (status === 'received_at_origin_branch') {
        return {
          title: 'Parcel reached origin branch. Linehaul assignment is unlocked.',
          text: 'Ready for linehaul assignment'
        };
      }
      if (status === 'linehaul_assigned') {
        return {
          title: 'Linehaul courier assigned. Load confirmation is required before transit.',
          text: 'Awaiting linehaul load confirmation'
        };
      }
      if (status === 'linehaul_load_confirmed') {
        return {
          title: 'Linehaul load confirmed. Courier can proceed in transit.',
          text: 'Linehaul ready to transit'
        };
      }
      if (status === 'linehaul_in_transit') {
        return {
          title: 'Parcel is in transit to destination branch. Confirm destination receipt to unlock delivery assignment.',
          text: 'Awaiting destination branch receipt'
        };
      }
      return {
        title: 'Linehaul assignment is locked for current status.',
        text: 'Linehaul assignment locked'
      };
    }

    if (activeLeg === 'delivery') {
      if (status === 'received_at_origin_branch' && !Boolean(order?.isIntercity)) {
        return {
          title: 'Parcel is at origin branch for intra-city shipment. Delivery assignment is unlocked.',
          text: 'Ready for delivery assignment'
        };
      }
      if (status === 'received_at_destination_branch') {
        return {
          title: 'Parcel reached destination branch. Delivery assignment is unlocked.',
          text: 'Ready for delivery assignment'
        };
      }
      if (status === 'delivery_assigned') {
        return {
          title: 'Delivery courier assigned. Load confirmation is required before out-for-delivery.',
          text: 'Awaiting delivery load confirmation'
        };
      }
      if (status === 'delivery_load_confirmed') {
        return {
          title: 'Delivery load is confirmed. Final-mile dispatch can start.',
          text: 'Ready for out-for-delivery'
        };
      }
      if (status === 'out_for_delivery') {
        return {
          title: 'Final-mile delivery is in progress.',
          text: 'Delivery in progress'
        };
      }
      if (status === 'delivery_attempt_failed') {
        return {
          title: 'Delivery attempt failed. Parcel is moving back to hub.',
          text: 'Delivery attempt failed'
        };
      }
      if (status === 'waiting_for_reattempt') {
        return {
          title: 'Parcel is at hub and waiting for reattempt assignment.',
          text: 'Ready for reattempt assignment'
        };
      }
      if (status === 'rts_pending') {
        return {
          title: 'Shipment is marked for return-to-sender processing.',
          text: 'RTS in progress'
        };
      }
      if (status === 'returned_to_sender') {
        return {
          title: 'Shipment has been returned to sender.',
          text: 'Returned to sender'
        };
      }
      return {
        title: 'Delivery assignment is locked for current status.',
        text: 'Delivery assignment locked'
      };
    }

    return {
      title: 'Assignment depends on current parcel status.',
      text: 'Assignment status pending'
    };
  };

  function canIssueFineForOrder(order) {
    if (!order) {
      return false;
    }
    if (Boolean(order?.isOnHold)) {
      return false;
    }
    const status = normalizeStatus(order?.status);
    return fineIssueAllowedStatuses.has(status);
  }

  function getFineIssueBlockReason(order) {
    if (!order) {
      return 'Select an order to issue fine.';
    }
    if (Boolean(order?.isOnHold)) {
      return 'Order is already on hold with a pending fine.';
    }
    const status = normalizeStatus(order?.status);
    if (fineIssueAllowedStatuses.has(status)) {
      return '';
    }
    return 'Fine can be issued only when parcel is in active movement/review stages.';
  }

  const isOrderPendingAssignment = (order) => {
    if (!order) {
      return false;
    }
    if (Boolean(order?.isOnHold)) {
      return false;
    }
    const status = normalizeStatus(order?.status);
    if (status === 'delivered' || status === 'cancelled') {
      return false;
    }

    if (canAssignPickup(status)) {
      return !Boolean(order?.pickupCourierId || order?.courierId);
    }
    if (canAssignLinehaul(order)) {
      return !Boolean(order?.linehaulCourierId);
    }
    if (canAssignDelivery(order)) {
      return !Boolean(order?.deliveryCourierId);
    }
    return false;
  };

  const orderViewOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'pending_assignment', label: 'Pending Assignment' },
    { value: 'fined', label: 'Fined' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const paymentFilterOptions = [
    { value: 'all', label: 'All payment status' },
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'failed', label: 'Failed' },
    { value: 'refunded', label: 'Refunded' }
  ];

  const fineFilterOptions = [
    { value: 'all', label: 'All fine status' },
    { value: 'pending', label: 'Fine Pending' },
    { value: 'applied', label: 'Fine Paid' },
    { value: 'waived', label: 'Fine Waived' },
    { value: 'none', label: 'No Fine' }
  ];

  const orderStatusOptions = useMemo(() => {
    const map = new Map();
    map.set('all', 'All statuses');
    (orders || []).forEach((order) => {
      const statusCode = getDisplayStatusCode(order);
      if (!statusCode) {
        return;
      }
      if (!map.has(statusCode)) {
        map.set(statusCode, formatStatus(statusCode));
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [orders]);

  const orderViewCounts = useMemo(() => {
    const counts = {
      all: 0,
      active: 0,
      on_hold: 0,
      pending_assignment: 0,
      fined: 0,
      delivered: 0,
      cancelled: 0
    };
    (orders || []).forEach((order) => {
      const status = normalizeStatus(order?.status);
      counts.all += 1;
      if (status !== 'delivered' && status !== 'cancelled') {
        counts.active += 1;
      }
      if (Boolean(order?.isOnHold)) {
        counts.on_hold += 1;
      }
      if (isOrderPendingAssignment(order)) {
        counts.pending_assignment += 1;
      }
      if (Boolean(order?.latestFine)) {
        counts.fined += 1;
      }
      if (status === 'delivered') {
        counts.delivered += 1;
      }
      if (status === 'cancelled') {
        counts.cancelled += 1;
      }
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = String(orderSearchQuery || '').trim().toLowerCase();
    return (orders || []).filter((order) => {
      const status = normalizeStatus(order?.status);
      const displayStatusCode = getDisplayStatusCode(order);
      const paymentStatus = String(order?.paymentStatus || '').trim().toLowerCase();
      const fineStatus = String(order?.latestFine?.status || '').trim().toLowerCase();

      if (orderViewMode === 'active' && (status === 'delivered' || status === 'cancelled')) {
        return false;
      }
      if (orderViewMode === 'on_hold' && !Boolean(order?.isOnHold)) {
        return false;
      }
      if (orderViewMode === 'pending_assignment' && !isOrderPendingAssignment(order)) {
        return false;
      }
      if (orderViewMode === 'fined' && !Boolean(order?.latestFine)) {
        return false;
      }
      if (orderViewMode === 'delivered' && status !== 'delivered') {
        return false;
      }
      if (orderViewMode === 'cancelled' && status !== 'cancelled') {
        return false;
      }

      if (orderStatusFilter !== 'all' && displayStatusCode !== orderStatusFilter) {
        return false;
      }
      if (orderPaymentFilter !== 'all' && paymentStatus !== orderPaymentFilter) {
        return false;
      }
      if (orderFineFilter === 'none' && Boolean(order?.latestFine)) {
        return false;
      }
      if (orderFineFilter !== 'all' && orderFineFilter !== 'none' && fineStatus !== orderFineFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }
      const searchBlob = [
        order?.code,
        order?.customer,
        order?.pickup,
        order?.delivery,
        order?.serviceType,
        formatStatus(displayStatusCode),
        order?.paymentMethod,
        order?.paymentStatus,
        order?.latestFine?.errorLabel,
        order?.latestFine?.errorType
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchBlob.includes(normalizedSearch);
    });
  }, [orders, orderSearchQuery, orderViewMode, orderStatusFilter, orderPaymentFilter, orderFineFilter]);

  return (
    <div className="bg-card rounded-xl shadow-elevation-md border border-border overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="Package" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Order & Parcel Management</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Review packages, verify details, and issue fines</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {error && (
            <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}
          {isLoading && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading orders...
            </div>
          )}
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-foreground">Filter View</p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => {
                  setOrderSearchQuery('');
                  setOrderViewMode('active');
                  setOrderStatusFilter('all');
                  setOrderPaymentFilter('all');
                  setOrderFineFilter('all');
                }}
              >
                Reset Filters
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {orderViewOptions.map((option) => {
                const isActive = orderViewMode === option.value;
                const count = Number(orderViewCounts?.[option.value] ?? 0);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-smooth ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground border border-border hover:bg-muted'
                    }`}
                    onClick={() => setOrderViewMode(option.value)}
                  >
                    <span>{option.label}</span>
                    <span className={`${isActive ? 'text-primary-foreground/90' : 'text-muted-foreground'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              <Input
                type="search"
                placeholder="Search order/customer..."
                value={orderSearchQuery}
                onChange={(event) => setOrderSearchQuery(event?.target?.value || '')}
              />
              <Select
                options={orderStatusOptions}
                value={orderStatusFilter}
                onChange={setOrderStatusFilter}
                placeholder="Filter status"
              />
              <Select
                options={paymentFilterOptions}
                value={orderPaymentFilter}
                onChange={setOrderPaymentFilter}
                placeholder="Filter payment"
              />
              <Select
                options={fineFilterOptions}
                value={orderFineFilter}
                onChange={setOrderFineFilter}
                placeholder="Filter fine"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Showing {filteredOrders.length} of {orders.length} orders
            </p>
          </div>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full min-w-[1160px]">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Courier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Declared vs Measured</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payment / Fine</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Assignment</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const activeLeg = getActiveAssignmentLeg(order);
                  const showPickupEditable = canAssignPickup(order.status);
                  const showPickupUnassign = showPickupEditable && Boolean(order?.pickupCourierId || order?.courierId);
                  const showPickupAssign = showPickupEditable && !showPickupUnassign;
                  const showOriginReceiptConfirm = canConfirmOriginReceipt(order);
                  const showDestinationReceiptConfirm = canConfirmDestinationReceipt(order);
                  const showLinehaulAssign = canAssignLinehaul(order) && !order?.linehaulCourierId;
                  const showDeliveryAssign = canAssignDelivery(order);
                  const pickupCourierOptions = pickupCouriersByOrder?.[order.id] || [];
                  const pickupOptionsLoaded = Object.prototype.hasOwnProperty.call(pickupCouriersByOrder, order.id);
                  const pickupOptionsLoading = Boolean(pickupCouriersLoadingByOrder?.[order.id]);
                  const currentDeliveryCourierId = Number(order?.deliveryCourierId ?? 0);
                  const deliveryCourierOptionsRaw = deliveryCouriersByOrder?.[order.id] || [];
                  const deliveryOptionsLoaded = Object.prototype.hasOwnProperty.call(deliveryCouriersByOrder, order.id);
                  const deliveryOptionsLoading = Boolean(deliveryCouriersLoadingByOrder?.[order.id]);
                  const deliveryCourierOptions = currentDeliveryCourierId > 0
                    && !deliveryCourierOptionsRaw.some((option) => Number(option?.value) === currentDeliveryCourierId)
                    ? [{ value: currentDeliveryCourierId, label: order?.deliveryCourier || `Courier #${currentDeliveryCourierId}`, disabled: true }, ...deliveryCourierOptionsRaw]
                    : deliveryCourierOptionsRaw;
                  const selectedDeliveryCourierId = Number(
                    pendingDeliveryAssignments?.[order.id] ?? order?.deliveryCourierId ?? 0
                  );
                  const hasSelectedDeliveryCourier = Number.isFinite(selectedDeliveryCourierId) && selectedDeliveryCourierId > 0;
                  const deliverySelectionUnchanged = currentDeliveryCourierId > 0
                    && hasSelectedDeliveryCourier
                    && selectedDeliveryCourierId === currentDeliveryCourierId;
                  const deliveryAssignLabel = currentDeliveryCourierId > 0 ? 'Change Delivery' : 'Assign Delivery';
                  const hasAssignmentAction = showPickupUnassign || showPickupAssign || showLinehaulAssign || showDeliveryAssign;
                  const lockCopy = assignmentLockCopy(order, activeLeg);

                  return (
                  <tr key={order.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-foreground">{order.code}</p>
                      <p className="text-xs text-muted-foreground">{order.serviceType} - {order.size}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{order.customer}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">Pickup:</span>{' '}
                          <span>{order.pickupCourier || order.courier || 'Unassigned'}</span>
                        </p>
                        {Boolean(order?.isIntercity) ? (
                          <p className="text-sm text-foreground">
                            <span className="text-muted-foreground">Linehaul:</span>{' '}
                            <span>{order.linehaulCourier || 'Unassigned'}</span>
                          </p>
                        ) : null}
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">Delivery:</span>{' '}
                          <span>{order.deliveryCourier || 'Unassigned'}</span>
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-foreground">{formatWeight(order.declaredWeight)}</p>
                      <p className="text-xs text-muted-foreground">Measured: {formatWeight(order.measuredWeight)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyles?.[getDisplayStatusCode(order)] || statusStyles.pending}`}>
                        {formatStatus(getDisplayStatusCode(order))}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Method: <span className="text-foreground">{formatPaymentMethod(order?.paymentMethod, order?.paymentProvider)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Parcel payment:{' '}
                          <span className={`px-1.5 py-0.5 rounded ${paymentStatusStyles[String(order?.paymentStatus || '').trim().toLowerCase()] || 'bg-muted text-muted-foreground'}`}>
                            {formatPaymentStatus(order?.paymentStatus)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Amount:{' '}
                          <span className="text-foreground">
                            {order?.paymentTotal !== null && order?.paymentTotal !== undefined
                              ? `RS ${Number(order.paymentTotal || 0).toFixed(2)}`
                              : 'N/A'}
                          </span>
                        </p>
                        {order?.latestFine ? (
                          <p className="text-xs text-muted-foreground">
                            Fine:{' '}
                            <span className={`px-1.5 py-0.5 rounded ${finePaymentStyles[String(order?.latestFine?.status || '').trim().toLowerCase()] || 'bg-muted text-muted-foreground'}`}>
                              {formatFineStatus(order?.latestFine?.status)}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Fine: <span className="text-foreground">None</span></p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        {showPickupUnassign ? (
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="UserMinus"
                            iconPosition="left"
                            onClick={() => handleUnassignCourier(order.id)}
                            disabled={isAssigning}
                          >
                            Unassign Pickup
                          </Button>
                        ) : showPickupAssign ? (
                          <div className="flex flex-col gap-2">
                            <Select
                              options={pickupCourierOptions}
                              value={pendingAssignments?.[order.id] || ''}
                              onChange={(value) =>
                                setPendingAssignments((prev) => ({ ...prev, [order.id]: value }))
                              }
                              placeholder={pickupOptionsLoaded && pickupCourierOptions.length === 0
                                ? 'No pickup couriers available'
                                : 'Select pickup courier'}
                              onOpenChange={(isOpen) => {
                                if (isOpen) {
                                  loadPickupCouriers(order.id);
                                }
                              }}
                              loading={pickupOptionsLoading}
                            />
                            <Button
                              variant="default"
                              size="sm"
                              iconName="UserPlus"
                              iconPosition="left"
                              onClick={() => handleAssignCourier(order.id)}
                              disabled={!pendingAssignments?.[order.id] || isAssigning || pickupOptionsLoading}
                            >
                              Assign Pickup
                            </Button>
                          </div>
                        ) : !hasAssignmentAction ? (
                          <span
                            className="text-xs text-muted-foreground"
                            title={lockCopy.title}
                          >
                            {lockCopy.text}
                          </span>
                        ) : null}

                        {showOriginReceiptConfirm ? (
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="Warehouse"
                            iconPosition="left"
                            onClick={() => handleConfirmBranchReceipt(order, 'origin')}
                            disabled={isAssigning}
                          >
                            Confirm Origin Receipt
                          </Button>
                        ) : null}

                        {showDestinationReceiptConfirm ? (
                          <Button
                            variant="outline"
                            size="sm"
                            iconName="Warehouse"
                            iconPosition="left"
                            onClick={() => handleConfirmBranchReceipt(order, 'destination')}
                            disabled={isAssigning}
                          >
                            Confirm Destination Receipt
                          </Button>
                        ) : null}

                        {showLinehaulAssign ? (
                          <div className="flex flex-col gap-2">
                            <Select
                              options={couriers}
                              value={pendingLinehaulAssignments?.[order.id] || ''}
                              onChange={(value) =>
                                setPendingLinehaulAssignments((prev) => ({ ...prev, [order.id]: value }))
                              }
                              placeholder="Select linehaul courier"
                            />
                            <Button
                              variant="default"
                              size="sm"
                              iconName="UserPlus"
                              iconPosition="left"
                              onClick={() => handleAssignLinehaul(order.id)}
                              disabled={!pendingLinehaulAssignments?.[order.id] || isAssigning}
                            >
                              Assign Linehaul
                            </Button>
                          </div>
                        ) : null}

                        {showDeliveryAssign ? (
                          <div className="flex flex-col gap-2">
                            <Select
                              options={deliveryCourierOptions}
                              value={pendingDeliveryAssignments?.[order.id] ?? order?.deliveryCourierId ?? ''}
                              onChange={(value) =>
                                setPendingDeliveryAssignments((prev) => ({ ...prev, [order.id]: value }))
                              }
                              placeholder={deliveryOptionsLoaded && deliveryCourierOptionsRaw.length === 0
                                ? 'No delivery couriers available'
                                : 'Select delivery courier'}
                              onOpenChange={(isOpen) => {
                                if (isOpen) {
                                  loadDeliveryCouriers(order.id);
                                }
                              }}
                              loading={deliveryOptionsLoading}
                            />
                            <Button
                              variant="default"
                              size="sm"
                              iconName="UserPlus"
                              iconPosition="left"
                              onClick={() => handleAssignDelivery(order.id)}
                              disabled={!hasSelectedDeliveryCourier || deliverySelectionUnchanged || isAssigning || deliveryOptionsLoading}
                            >
                              {deliveryAssignLabel}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <Button
                          variant={order.flagged ? 'default' : 'outline'}
                          size="sm"
                          iconName="AlertTriangle"
                          iconPosition="left"
                          onClick={() => selectOrder(order)}
                        >
                          {order.flagged ? 'Issue Fine' : 'Review'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconName="MessageCircle"
                          iconPosition="left"
                          onClick={() => openOrderChat(order, 'customer')}
                          disabled={Number(order?.customerId) <= 0}
                        >
                          Message Customer
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconName="MessageSquare"
                          iconPosition="left"
                          onClick={() => openOrderChat(order, 'courier')}
                          disabled={Number(order?.courierId) <= 0}
                        >
                          Message Courier
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!isLoading && orders.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No orders available.
            </div>
          )}
          {!isLoading && orders.length > 0 && filteredOrders.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No orders match the current filters.
            </div>
          )}
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-4 md:p-5">
          <h3 className="text-base font-semibold text-foreground mb-2">Order review</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Reason will be provided to the user after review.
          </p>

          {selectedOrder ? (
            <div className="space-y-3">
              <div className="bg-card rounded-lg p-3 border border-border">
                <p className="text-xs text-muted-foreground">Selected Order</p>
                <p className="text-sm font-semibold text-foreground">{selectedOrder.code}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking Code: <span className="text-foreground">{selectedOrder.code}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Delivery Access Code: <span className="text-foreground">{selectedOrder.deliveryAccessCode || 'N/A'}</span>
                </p>
                <p className="text-xs text-muted-foreground">{selectedOrder.pickup}</p>
                <p className="text-xs text-muted-foreground">{selectedOrder.delivery}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Status: <span className="text-foreground">{formatStatus(getDisplayStatusCode(selectedOrder))}</span></div>
                  <div>Service: <span className="text-foreground">{selectedOrder.serviceType}</span></div>
                  <div>Category: <span className="text-foreground">{selectedOrder.category}</span></div>
                  <div>Size: <span className="text-foreground">{selectedOrder.size}</span></div>
                  <div>Distance: <span className="text-foreground">{selectedOrder.distanceKm ? `${selectedOrder.distanceKm.toFixed(1)} km` : 'N/A'}</span></div>
                  <div>Scheduled: <span className="text-foreground">{selectedOrder.scheduledDate ? `${selectedOrder.scheduledDate} ${selectedOrder.scheduledTime || ''}` : 'N/A'}</span></div>
                  <div>Customer: <span className="text-foreground">{selectedOrder.customer}</span></div>
                  <div>Customer Email: <span className="text-foreground">{selectedOrder.customerEmail || 'N/A'}</span></div>
                  <div>Customer Phone: <span className="text-foreground">{selectedOrder.customerPhone || 'N/A'}</span></div>
                  <div>Courier Role: <span className="text-foreground">{selectedOrder.courierRole || 'N/A'}</span></div>
                  <div>Payment Method: <span className="text-foreground">{formatPaymentMethod(selectedOrder?.paymentMethod, selectedOrder?.paymentProvider)}</span></div>
                  <div>
                    Parcel Payment:{' '}
                    <span className={`px-1.5 py-0.5 rounded ${paymentStatusStyles[String(selectedOrder?.paymentStatus || '').trim().toLowerCase()] || 'bg-muted text-muted-foreground'}`}>
                      {formatPaymentStatus(selectedOrder?.paymentStatus)}
                    </span>
                  </div>
                  <div>Parcel Amount: <span className="text-foreground">{selectedOrder?.paymentTotal !== null && selectedOrder?.paymentTotal !== undefined ? `RS ${Number(selectedOrder.paymentTotal || 0).toFixed(2)}` : 'N/A'}</span></div>
                  <div>
                    Fine Payment:{' '}
                    {selectedOrder?.latestFine ? (
                      <span className={`px-1.5 py-0.5 rounded ${finePaymentStyles[String(selectedOrder?.latestFine?.status || '').trim().toLowerCase()] || 'bg-muted text-muted-foreground'}`}>
                        {formatFineStatus(selectedOrder?.latestFine?.status)}
                      </span>
                    ) : (
                      <span className="text-foreground">None</span>
                    )}
                  </div>
                </div>
                {selectedOrder?.latestFine ? (
                  <div className={`mt-2 rounded-md border p-2 text-xs text-foreground space-y-1 ${
                    String(selectedOrder?.latestFine?.status || '').trim().toLowerCase() === 'pending'
                      ? 'border-warning/30 bg-warning/10'
                      : 'border-success/30 bg-success/10'
                  }`}>
                    <p className="font-semibold">Fine Details</p>
                    <p>
                      Status:{' '}
                      <span className={`font-medium ${
                        String(selectedOrder?.latestFine?.status || '').trim().toLowerCase() === 'pending'
                          ? 'text-warning'
                          : 'text-success'
                      }`}>
                        {formatFineStatus(selectedOrder?.latestFine?.status)}
                      </span>
                    </p>
                    <p>
                      Reason:{' '}
                      <span className="font-medium">
                        {selectedOrder?.latestFine?.errorLabel || selectedOrder?.latestFine?.errorType || 'N/A'}
                      </span>
                    </p>
                    <p>
                      Amount:{' '}
                      <span className="font-medium">
                        RS {Number(selectedOrder?.latestFine?.amount || 0).toFixed(2)}
                      </span>
                    </p>
                    {selectedOrder?.latestFine?.notes ? (
                      <p>Notes: <span className="font-medium">{selectedOrder.latestFine.notes}</span></p>
                    ) : null}
                  </div>
                ) : null}
                {selectedOrder.description && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Description: <span className="text-foreground">{selectedOrder.description}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="MessageCircle"
                    iconPosition="left"
                    onClick={() => openOrderChat(selectedOrder, 'customer')}
                    disabled={Number(selectedOrder?.customerId) <= 0}
                  >
                    Message Customer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="MessageSquare"
                    iconPosition="left"
                    onClick={() => openOrderChat(selectedOrder, 'courier')}
                    disabled={Number(selectedOrder?.courierId) <= 0}
                  >
                    Message Courier
                  </Button>
                </div>
              </div>

              <div className="bg-card rounded-lg p-3 border border-border space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Cancellation / Failure History</p>
                  <Button
                    variant="ghost"
                    size="xs"
                    iconName="RefreshCw"
                    iconPosition="left"
                    onClick={() => loadIncidentHistory(selectedOrder?.id)}
                    disabled={incidentHistoryLoading}
                  >
                    Refresh
                  </Button>
                </div>
                {incidentHistoryLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history...</p>
                ) : null}
                {!incidentHistoryLoading && incidentHistoryError ? (
                  <p className="text-xs text-error">{incidentHistoryError}</p>
                ) : null}
                {!incidentHistoryLoading && !incidentHistoryError && incidentHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No cancellation or delivery failure events logged for this order yet.
                  </p>
                ) : null}
                {!incidentHistoryLoading && !incidentHistoryError && incidentHistory.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {incidentHistory.map((entry) => {
                      const type = String(entry?.type || '').trim().toLowerCase();
                      const source = String(entry?.source || '').trim().toLowerCase();
                      const reasonText = String(entry?.reasonText || '').trim();
                      const notes = String(entry?.notes || '').trim();
                      const description = String(entry?.description || '').trim();
                      const actorLabel = formatActorLabel(entry);
                      const actionContext = String(entry?.actionContext || '').trim();
                      const decisionStatus = String(entry?.decisionStatus || '').trim().toLowerCase();
                      const decisionReasonText = String(entry?.decisionReasonText || '').trim();
                      const decisionNotes = String(entry?.decisionNotes || '').trim();
                      const refundAction = String(entry?.refundAction || '').trim();
                      const refundMessage = String(entry?.refundMessage || '').trim();
                      const refundAmount = Number(entry?.refundAmount);
                      const isPendingDecision = !decisionStatus || decisionStatus === 'pending';
                      const isPickupCancellationRequest = type === 'pickup_cancellation'
                        && ['cancellation_requests', 'order_events'].includes(source);
                      const canApprovePickupRequest = isPickupCancellationRequest
                        && isPendingDecision
                        && normalizeStatus(selectedOrder?.status) !== 'cancelled';
                      const canRejectPickupRequest = canApprovePickupRequest;
                      const canApproveIncidentRequest = !isPickupCancellationRequest
                        && type === 'delivery_failure'
                        && isPendingDecision
                        && normalizeStatus(selectedOrder?.status) !== 'cancelled';
                      const canRejectIncidentRequest = !isPickupCancellationRequest
                        && ['pickup_cancellation', 'delivery_cancellation', 'delivery_failure'].includes(type)
                        && isPendingDecision
                        && normalizeStatus(selectedOrder?.status) !== 'cancelled';
                      return (
                        <div key={entry?.id} className="rounded-md border border-border bg-muted/20 p-2.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${incidentTypeStyles?.[type] || 'bg-muted text-muted-foreground'}`}>
                                {entry?.typeLabel || type || 'Event'}
                              </span>
                              {decisionStatus ? (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${incidentDecisionStyles?.[decisionStatus] || 'bg-muted text-muted-foreground'}`}>
                                  {decisionStatus}
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{formatIncidentTime(entry?.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Actor: <span className="text-foreground">{actorLabel}</span>
                            {actionContext ? (
                              <>
                                {' | '}Context: <span className="text-foreground">{actionContext}</span>
                              </>
                            ) : null}
                          </p>
                          {reasonText ? (
                            <p className="mt-1 text-xs text-foreground">
                              Reason: <span className="font-medium">{reasonText}</span>
                            </p>
                          ) : null}
                          {decisionReasonText ? (
                            <p className="mt-1 text-xs text-foreground">
                              Decision reason: <span className="font-medium">{decisionReasonText}</span>
                            </p>
                          ) : null}
                          {notes ? (
                            <p className="mt-1 text-xs text-muted-foreground">Notes: {notes}</p>
                          ) : null}
                          {decisionNotes ? (
                            <p className="mt-1 text-xs text-muted-foreground">Decision notes: {decisionNotes}</p>
                          ) : null}
                          {!notes && description ? (
                            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                          ) : null}
                          {refundAction ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Refund: <span className="text-foreground">{refundAction.replaceAll('_', ' ')}</span>
                              {Number.isFinite(refundAmount) && refundAmount > 0
                                ? ` | RS ${refundAmount.toFixed(2)}`
                                : ''}
                              {refundMessage ? ` | ${refundMessage}` : ''}
                            </p>
                          ) : null}
                          {canApprovePickupRequest || canApproveIncidentRequest || canRejectPickupRequest || canRejectIncidentRequest ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canApprovePickupRequest ? (
                                <Button
                                  variant="default"
                                  size="xs"
                                  iconName="CheckCircle2"
                                  iconPosition="left"
                                  onClick={() => openApprovePickupFlow(entry)}
                                >
                                  Approve Cancellation
                                </Button>
                              ) : null}
                              {canApproveIncidentRequest ? (
                                <Button
                                  variant="default"
                                  size="xs"
                                  iconName="CheckCircle2"
                                  iconPosition="left"
                                  onClick={() => openApproveIncidentFlow(entry)}
                                >
                                  Approve Request
                                </Button>
                              ) : null}
                              {canRejectPickupRequest ? (
                                <Button
                                  variant="danger"
                                  size="xs"
                                  iconName="Ban"
                                  iconPosition="left"
                                  onClick={() => openRejectPickupFlow(entry)}
                                >
                                  Reject Request
                                </Button>
                              ) : null}
                              {canRejectIncidentRequest ? (
                                <Button
                                  variant="danger"
                                  size="xs"
                                  iconName="Ban"
                                  iconPosition="left"
                                  onClick={() => openRejectFlow(entry)}
                                >
                                  Reject Request
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {normalizeStatus(selectedOrder?.status) === 'delivered' ? (
                <div className="bg-card rounded-lg p-3 border border-border space-y-2">
                  <p className="text-xs text-muted-foreground">Update Booking</p>
                  <p className="text-xs text-muted-foreground">
                    This order is delivered and locked. Further booking updates are disabled.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    iconName="RotateCcw"
                    iconPosition="left"
                    onClick={handleOpenDeliveredReopen}
                    disabled={isReopeningDelivered}
                  >
                    Reopen Delivered Status
                  </Button>
                </div>
              ) : (
                <div className="bg-card rounded-lg p-3 border border-border space-y-3">
                  <p className="text-xs text-muted-foreground">Update Booking</p>
                  <Select
                    label="Status"
                    options={[
                      { value: 'created', label: 'Created' },
                      { value: 'pickup_assigned', label: 'Pickup Assigned' },
                      { value: 'picked_up', label: 'Picked Up' },
                      { value: 'in_transit_to_origin_branch', label: 'In Transit to Branch' },
                      { value: 'received_at_origin_branch', label: 'In Branch (Origin)' },
                      { value: 'linehaul_assigned', label: 'Linehaul Assigned' },
                      { value: 'linehaul_load_confirmed', label: 'Linehaul Load Confirmed' },
                      { value: 'linehaul_in_transit', label: 'Linehaul In Transit' },
                      { value: 'received_at_destination_branch', label: 'In Branch (Destination)' },
                      { value: 'delivery_assigned', label: 'Delivery Assigned' },
                      { value: 'delivery_load_confirmed', label: 'Delivery Load Confirmed' },
                      { value: 'out_for_delivery', label: 'Out For Delivery' },
                      { value: 'delivery_attempt_failed', label: 'Delivery Attempt Failed' },
                      { value: 'waiting_for_reattempt', label: 'Waiting for Reattempt' },
                      { value: 'rts_pending', label: 'RTS Pending' },
                      { value: 'returned_to_sender', label: 'Returned to Sender' },
                      { value: 'delivered', label: 'Delivered' }
                    ]}
                    value={editForm.status}
                    onChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}
                    placeholder="Select status"
                  />
                  <Select
                    label="Service Type"
                    options={[
                      { value: 'same-day', label: 'Same Day' },
                      { value: 'express', label: 'Express' },
                      { value: 'next-day', label: 'Next Day' },
                      { value: 'standard', label: 'Standard' },
                      { value: 'scheduled', label: 'Scheduled' }
                    ]}
                    value={editForm.serviceType}
                    onChange={(value) => setEditForm((prev) => ({ ...prev, serviceType: value }))}
                    placeholder="Select service"
                  />
                  <Input
                    label="Declared Weight (kg)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={editForm.declaredWeight}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, declaredWeight: e?.target?.value }))}
                    placeholder="Enter declared weight"
                  />
                  {editForm.serviceType === 'scheduled' && (
                    <>
                      <Input
                        label="Scheduled Date"
                        type="date"
                        value={editForm.scheduledDate}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, scheduledDate: e?.target?.value }))}
                      />
                      <Input
                        label="Scheduled Time"
                        type="text"
                        placeholder="08:00-10:00"
                        value={editForm.scheduledTime}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, scheduledTime: e?.target?.value }))}
                      />
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      iconName="Save"
                      iconPosition="left"
                      onClick={handleUpdateBooking}
                      disabled={isSaving || normalizeStatus(selectedOrder?.status) === 'cancelled'}
                    >
                      Save Changes
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      iconName="Ban"
                      iconPosition="left"
                      onClick={handleOpenPrePickupForceCancel}
                      disabled={isSaving}
                      title={canOpenPrePickupForceCancel ? 'Open pre-pickup force cancellation flow' : prePickupForceCancelBlockReason}
                    >
                      Force Cancel (Pre-Pickup)
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      iconName="AlertTriangle"
                      iconPosition="left"
                      onClick={handleOpenFinalCancel}
                      disabled={isSaving}
                      title={canOpenFinalCancel ? 'Open final cancellation flow' : finalCancelBlockReason}
                    >
                      Final Cancel Order
                    </Button>
                  </div>
                  {!canOpenFinalCancel ? (
                    <p className="text-[11px] text-warning">
                      {finalCancelBlockReason}
                    </p>
                  ) : null}
                  {!canOpenPrePickupForceCancel ? (
                    <p className="text-[11px] text-muted-foreground">
                      {prePickupForceCancelBlockReason}
                    </p>
                  ) : null}
                </div>
              )}

              <Select
                label="Error Type"
                options={fineOptions}
                value={fineType}
                onChange={setFineType}
                placeholder="Select error type"
                disabled={!canIssueFine}
              />

              {selectedFine && (
                <div className="bg-card rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Immediate Result</p>
                  <p className="text-sm text-foreground mb-2">{selectedFine.immediateResult}</p>
                  <p className="text-xs text-muted-foreground mb-1">Financial Result</p>
                  <p className="text-sm text-foreground">{selectedFine.financialResult}</p>
                </div>
              )}

              <Input
                label="Fine Amount (RS)"
                placeholder="RS 0.00"
                value={fineAmount}
                onChange={(e) => setFineAmount(e?.target?.value)}
                disabled={!canIssueFine}
              />

              <Input
                label="Admin Notes"
                placeholder="Reason details for audit log"
                value={fineNotes}
                onChange={(e) => setFineNotes(e?.target?.value)}
                disabled={!canIssueFine}
              />

              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  iconName="CheckCircle2"
                  iconPosition="left"
                  disabled={!fineType || isSaving || !canIssueFine}
                  onClick={handleApplyFine}
                >
                  Apply Fine
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFineForm}
                  disabled={isSaving}
                >
                  Clear
                </Button>
              </div>
              {!canIssueFine ? (
                <p className="text-[11px] text-warning">
                  {fineIssueBlockReason}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-6">
              <Icon name="ClipboardList" size={24} className="text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Select an order to review and issue fines.</p>
            </div>
          )}
        </div>
      </div>
      <DangerActionModal
        isOpen={rejectFlow?.isOpen}
        onClose={closeRejectFlow}
        title={`Reject Incident Request${rejectFlow?.trackingLabel ? ` - ${rejectFlow.trackingLabel}` : ''}`}
        subtitle="This will notify the requesting courier and the customer with your reason."
        reasonLabel="Rejection Reason (Required)"
        reasonOptions={ADMIN_INCIDENT_REJECTION_REASONS}
        reasonValue={rejectReasonCode}
        onReasonChange={setRejectReasonCode}
        notesLabel="Admin Notes"
        notesPlaceholder="Explain why request was not accepted"
        notesValue={rejectNotes}
        onNotesChange={setRejectNotes}
        continueLabel="Continue Rejection"
        finalConfirmLabel="Reject Request"
        confirmPrompt="Are you sure you want to reject this cancellation/failure request?"
        finalCheckLabel="I confirm this rejection reason will be sent to courier and customer."
        isSubmitting={isRejecting}
        submitError={rejectError}
        onSubmit={submitRejectFlow}
      />
      <DangerActionModal
        isOpen={approveIncidentFlow?.isOpen}
        onClose={closeApproveIncidentFlow}
        title={`Approve Incident Request${approveIncidentFlow?.trackingLabel ? ` - ${approveIncidentFlow.trackingLabel}` : ''}`}
        subtitle="This confirms the courier incident request and keeps stakeholders informed."
        showReasonField={false}
        requireReason={false}
        notesLabel="Admin Note (Optional)"
        notesPlaceholder="Optional note shared with courier/customer"
        notesValue={approveIncidentNotes}
        onNotesChange={setApproveIncidentNotes}
        continueLabel="Continue Approval"
        finalConfirmLabel="Approve Request"
        confirmPrompt="Approve this incident request?"
        finalCheckLabel="I confirm this incident request is valid."
        isSubmitting={isApprovingIncident}
        submitError={approveIncidentError}
        onSubmit={submitApproveIncidentFlow}
      />
      <DangerActionModal
        isOpen={approvePickupFlow?.isOpen}
        onClose={closeApprovePickupFlow}
        title={`Approve Pickup Cancellation${approvePickupFlow?.trackingLabel ? ` - ${approvePickupFlow.trackingLabel}` : ''}`}
        subtitle="This will cancel the booking and clear pickup assignment."
        showReasonField={false}
        requireReason={false}
        notesLabel="Admin Note (Optional)"
        notesPlaceholder="Optional note to courier/customer"
        notesValue={approvePickupNotes}
        onNotesChange={setApprovePickupNotes}
        continueLabel="Continue Approval"
        finalConfirmLabel="Approve Cancellation"
        confirmPrompt="Approve pickup cancellation? This will cancel the booking."
        finalCheckLabel="I confirm this order should be cancelled now."
        isSubmitting={isApprovingPickup}
        submitError={approvePickupError}
        onSubmit={submitApprovePickupFlow}
      />
      <DangerActionModal
        isOpen={rejectPickupFlow?.isOpen}
        onClose={closeRejectPickupFlow}
        title={`Reject Pickup Cancellation${rejectPickupFlow?.trackingLabel ? ` - ${rejectPickupFlow.trackingLabel}` : ''}`}
        subtitle="This keeps the order active and notifies the courier."
        showReasonField={false}
        requireReason={false}
        notesLabel="Admin Note (Optional)"
        notesPlaceholder="Optional note explaining rejection"
        notesValue={rejectPickupNotes}
        onNotesChange={setRejectPickupNotes}
        continueLabel="Continue Rejection"
        finalConfirmLabel="Reject Request"
        confirmPrompt="Reject pickup cancellation request and keep the booking active?"
        finalCheckLabel="I confirm this pickup cancellation request should be rejected."
        isSubmitting={isRejectingPickup}
        submitError={rejectPickupError}
        onSubmit={submitRejectPickupFlow}
      />
      <DangerActionModal
        isOpen={isDeliveredReopenOpen}
        onClose={handleCloseDeliveredReopen}
        title={`Reopen Delivered Order${selectedOrder?.code ? ` - ${selectedOrder.code}` : ''}`}
        subtitle="Admin-only override. Use only after verification. This action is fully audited."
        reasonLabel="Reopen Reason (Required)"
        reasonOptions={deliveredReopenReasonOptions}
        reasonValue={deliveredReopenReason}
        onReasonChange={setDeliveredReopenReason}
        notesLabel="Admin Notes (Required)"
        notesPlaceholder="Describe why delivered status must be reopened"
        notesValue={deliveredReopenNotes}
        onNotesChange={setDeliveredReopenNotes}
        continueLabel="Continue Reopen"
        finalConfirmLabel="Yes, Reopen Status"
        confirmPrompt="Are you sure you want to reopen this delivered order?"
        finalCheckLabel="I confirm this delivered-status override is verified and approved."
        isSubmitting={isReopeningDelivered}
        submitError={deliveredReopenError}
        disableContinue={!String(deliveredReopenNotes || '').trim()}
        onSubmit={handleSubmitDeliveredReopen}
        stepOneFooter={(
          <div className="space-y-1">
            <label className="block text-xs font-medium text-foreground">Target Status</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={deliveredReopenStatus}
              onChange={(event) => setDeliveredReopenStatus(event.target.value)}
            >
              {deliveredReopenStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
      />
      <DangerActionModal
        isOpen={isPrePickupForceCancelOpen}
        onClose={handleClosePrePickupForceCancel}
        title={`Force Cancel (Pre-Pickup)${selectedOrder?.code ? ` - ${selectedOrder.code}` : ''}`}
        subtitle="Admin-only flow. Allowed only before pickup starts."
        reasonLabel="Cancellation Reason (Required)"
        reasonOptions={ADMIN_PRE_PICKUP_FORCE_CANCELLATION_REASONS}
        reasonValue={prePickupForceReason}
        onReasonChange={setPrePickupForceReason}
        notesLabel="Admin Notes"
        notesPlaceholder="Explain why this order is being force-cancelled before pickup"
        notesValue={prePickupForceNotes}
        onNotesChange={setPrePickupForceNotes}
        continueLabel="Continue Force Cancellation"
        finalConfirmLabel="Yes, Force Cancel"
        confirmPrompt="Are you sure you want to force-cancel this order before pickup starts?"
        finalCheckLabel="I confirm pickup has not started and this cancellation reason is accurate."
        isSubmitting={isSaving}
        submitError={prePickupForceError}
        disableContinue={!canOpenPrePickupForceCancel}
        onSubmit={handlePrePickupForceCancelBooking}
      />
      <DangerActionModal
        isOpen={isFinalCancelOpen}
        onClose={handleCloseFinalCancel}
        title={`Final Order Cancellation${selectedOrder?.code ? ` - ${selectedOrder.code}` : ''}`}
        subtitle="Admin-only flow. This will lock the order and write an audit trail."
        reasonLabel="Cancellation Reason (Required)"
        reasonOptions={ADMIN_FINAL_CANCELLATION_REASONS}
        reasonValue={finalCancelReason}
        onReasonChange={setFinalCancelReason}
        notesLabel="Admin Notes"
        notesPlaceholder="Detailed notes for audit log and refund trace"
        notesValue={finalCancelNotes}
        onNotesChange={setFinalCancelNotes}
        continueLabel="Continue Final Cancellation"
        finalConfirmLabel="Yes, Finalize Cancellation"
        confirmPrompt="Are you sure you want to fully cancel this order?"
        finalCheckLabel="I confirm this final cancellation should proceed."
        isSubmitting={isSaving}
        submitError={finalCancelError}
        disableContinue={
          !finalCancelChecks.pickupCompletionConfirmed
          || !finalCancelChecks.deliveryAttemptFailed
          || !finalCancelChecks.customerConfirmedCancellation
          || (
            finalCancelRefundAction === 'partial_refund'
            && (!Number.isFinite(Number(finalCancelRefundAmount)) || Number(finalCancelRefundAmount) <= 0)
          )
        }
        onSubmit={handleFinalCancelBooking}
        stepOneFooter={(
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground">Required Checks</p>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={finalCancelChecks.pickupCompletionConfirmed}
                onChange={(event) => setFinalCancelChecks((prev) => ({
                  ...prev,
                  pickupCompletionConfirmed: event.target.checked
                }))}
              />
              Pickup is completed.
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={finalCancelChecks.deliveryAttemptFailed}
                onChange={(event) => setFinalCancelChecks((prev) => ({
                  ...prev,
                  deliveryAttemptFailed: event.target.checked
                }))}
              />
              Delivery attempt failed.
            </label>
            <label className="flex items-start gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={finalCancelChecks.customerConfirmedCancellation}
                onChange={(event) => setFinalCancelChecks((prev) => ({
                  ...prev,
                  customerConfirmedCancellation: event.target.checked
                }))}
              />
              Customer confirmed cancellation.
            </label>
            <div className="pt-1">
              <label className="mb-1 block text-xs font-medium text-foreground">Refund Action</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={finalCancelRefundAction}
                onChange={(event) => setFinalCancelRefundAction(event.target.value)}
              >
                {REFUND_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {finalCancelRefundAction === 'partial_refund' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">Partial Refund Amount (RS)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={finalCancelRefundAmount}
                  onChange={(event) => setFinalCancelRefundAmount(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="0.00"
                />
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  );
};

export default OrderManagementPanel;
