import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import Button from '../../../components/ui/Button';
import { formatNepaliPhone } from '../../../utils/format';

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const formatRsAmount = (amount) => {
  const value = toNumberOrNull(amount);
  if (value === null) {
    return 'N/A';
  }
  return `RS ${value.toFixed(2)}`;
};

const formatBranchAddress = (branch) => {
  if (!branch) {
    return '';
  }
  const locality = [branch?.city, branch?.province].filter(Boolean).join(', ');
  return [branch?.name, branch?.address, locality, branch?.postalCode].filter(Boolean).join(', ');
};

const ActiveDeliverySection = ({
  activeDelivery,
  onCaptureProof,
  onCompleteDelivery,
  courierRole,
  onMessage,
  onRequestIncident,
  incidentAction = null,
  canChat = true,
  chatDisabledReason = '',
  chatUnreadCount = 0
}) => {
  const [showProofCapture, setShowProofCapture] = useState(false);
  const [proofData, setProofData] = useState({
    photo: null,
    signature: null,
    notes: ''
  });

  const roleLabel = courierRole === 'pickup'
    ? 'Pickup'
    : courierRole === 'linehaul'
      ? 'Linehaul'
      : courierRole === 'delivery'
        ? 'Delivery'
        : 'Delivery';
  const roleNoun = roleLabel.toLowerCase();
  const rolePlural = courierRole === 'delivery' || roleLabel === 'Delivery'
    ? 'deliveries'
    : `${roleNoun}s`;
  const isLinehaulCourier = courierRole === 'linehaul';
  const currentStatusCode = String(activeDelivery?.status || '').trim().toLowerCase();
  const normalizedCourierRole = String(courierRole || 'both').trim().toLowerCase();
  const originBranchAddress = formatBranchAddress(activeDelivery?.originBranch);
  const destinationBranchAddress = formatBranchAddress(activeDelivery?.destinationBranch);
  const pickupAddress = String(activeDelivery?.pickupAddress || '').trim();
  const deliveryAddress = String(activeDelivery?.deliveryAddress || '').trim();
  const isIntercity = Boolean(activeDelivery?.isIntercity);
  const dispatchBranchAddress = isIntercity
    ? (destinationBranchAddress || originBranchAddress)
    : (originBranchAddress || destinationBranchAddress);

  const navigationPlan = (() => {
    const plan = {
      origin: '',
      destination: '',
      waypoints: [],
      locationLabel: 'Next Stop',
      locationAddress: ''
    };

    if (normalizedCourierRole === 'linehaul') {
      plan.origin = originBranchAddress || pickupAddress;
      plan.destination = destinationBranchAddress || deliveryAddress || pickupAddress;
      plan.locationLabel = 'Destination Branch';
      plan.locationAddress = plan.destination;
      return plan;
    }

    if (normalizedCourierRole === 'pickup') {
      if (['picked_up', 'in_transit_to_origin_branch'].includes(currentStatusCode)) {
        plan.origin = pickupAddress;
        plan.destination = originBranchAddress || pickupAddress;
        plan.locationLabel = 'Origin Branch';
      } else {
        plan.destination = pickupAddress || originBranchAddress;
        plan.locationLabel = 'Pickup Address';
      }
      plan.locationAddress = plan.destination;
      return plan;
    }

    if (normalizedCourierRole === 'delivery') {
      if (['delivery_attempt_failed', 'waiting_for_reattempt'].includes(currentStatusCode)) {
        plan.origin = deliveryAddress;
        plan.destination = dispatchBranchAddress || deliveryAddress || pickupAddress;
        plan.locationLabel = 'Dispatch Branch';
      } else {
        plan.origin = dispatchBranchAddress;
        plan.destination = deliveryAddress || dispatchBranchAddress || pickupAddress;
        plan.locationLabel = 'Delivery Address';
      }
      plan.locationAddress = plan.destination;
      return plan;
    }

    if (currentStatusCode === 'pickup_assigned') {
      plan.destination = pickupAddress || originBranchAddress;
      plan.locationLabel = 'Pickup Address';
    } else if (['picked_up', 'in_transit_to_origin_branch'].includes(currentStatusCode)) {
      plan.origin = pickupAddress;
      plan.destination = originBranchAddress || pickupAddress || deliveryAddress;
      plan.locationLabel = 'Origin Branch';
    } else if (['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit'].includes(currentStatusCode)) {
      plan.origin = originBranchAddress || pickupAddress;
      plan.destination = destinationBranchAddress || deliveryAddress || originBranchAddress;
      plan.locationLabel = 'Destination Branch';
    } else if (['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery'].includes(currentStatusCode)) {
      plan.origin = dispatchBranchAddress;
      plan.destination = deliveryAddress || dispatchBranchAddress || pickupAddress;
      plan.locationLabel = 'Delivery Address';
    } else if (['delivery_attempt_failed', 'waiting_for_reattempt'].includes(currentStatusCode)) {
      plan.origin = deliveryAddress;
      plan.destination = dispatchBranchAddress || deliveryAddress || pickupAddress;
      plan.locationLabel = 'Dispatch Branch';
    } else {
      plan.destination = deliveryAddress || pickupAddress || dispatchBranchAddress;
      plan.locationLabel = plan.destination === pickupAddress ? 'Pickup Address' : 'Delivery Address';
    }

    plan.locationAddress = plan.destination;
    return plan;
  })();

  const navigationAddress = String(navigationPlan.destination || '').trim();
  const locationLabel = navigationPlan.locationLabel;
  const locationAddress = navigationPlan.locationAddress;
  const hasNavigationDestination = navigationAddress !== '';

  const buildGoogleMapsNavigationUrl = () => {
    if (!hasNavigationDestination) {
      return '';
    }
    const destination = navigationAddress;
    const origin = String(navigationPlan.origin || '').trim();
    const waypoints = (Array.isArray(navigationPlan.waypoints) ? navigationPlan.waypoints : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value !== '' && value !== origin && value !== destination);

    const params = new URLSearchParams({ api: '1', destination });
    if (origin && origin !== destination) {
      params.set('origin', origin);
    }
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.join('|'));
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  const requiresProof = activeDelivery?.status === 'out_for_delivery';
  const paymentMethodLabel = formatPaymentMethodLabel(activeDelivery?.paymentMethod, activeDelivery?.paymentProvider);
  const paymentStatusLabel = formatPaymentStatusLabel(activeDelivery?.paymentStatus);
  const paymentTotal = toNumberOrNull(activeDelivery?.paymentTotal);
  const cashToCollect = toNumberOrNull(activeDelivery?.cashToCollect);
  const isCashOnPickup = String(activeDelivery?.paymentMethod || '').trim().toLowerCase() === 'cash';
  const shouldCollectCashNow = isCashOnPickup && currentStatusCode === 'pickup_assigned';
  const hasPaymentInfo = Boolean(paymentMethodLabel || paymentStatusLabel || paymentTotal !== null);
  const progressLabelByStatus = {
    pickup_assigned: 'Confirm Pickup',
    picked_up: 'Start Transfer',
    delivery_load_confirmed: 'Out for Delivery',
    out_for_delivery: 'Complete Delivery'
  };
  const isPendingLoadConfirmation = (
    (currentStatusCode === 'linehaul_assigned' && (normalizedCourierRole === 'linehaul' || normalizedCourierRole === 'both'))
    || (currentStatusCode === 'delivery_assigned' && (normalizedCourierRole === 'delivery' || normalizedCourierRole === 'both'))
  );
  const progressLabel = progressLabelByStatus[activeDelivery?.status] || 'Update Status';
  const canProgress = Boolean(progressLabelByStatus[activeDelivery?.status]) && !isPendingLoadConfirmation;

  if (!activeDelivery) {
    return (
      <div className="bg-card rounded-xl shadow-elevation-md p-6 md:p-8 border border-border text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="Package" size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Active {roleLabel}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          You don't have any active {rolePlural} at the moment
        </p>
        <Button variant="default" iconName="Plus" iconPosition="left">
          Accept New {roleLabel}
        </Button>
      </div>
    );
  }

  const handleProofSubmit = async () => {
    onCaptureProof(proofData);
    setShowProofCapture(false);
    await onCompleteDelivery?.(activeDelivery?.id);
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
            <Icon name="Truck" size={20} color="var(--color-accent)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Active {roleLabel}</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Currently in progress</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full animate-pulse">
          IN TRANSIT
        </span>
      </div>
      <div className="bg-gradient-to-br from-accent/5 to-accent/10 rounded-xl p-4 md:p-6 mb-6 border border-accent/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base md:text-lg font-semibold text-foreground">{activeDelivery?.trackingId}</h3>
          <span className="text-lg md:text-xl font-bold text-accent">RS {activeDelivery?.earnings?.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Icon name="Package" size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Package Type</p>
              <p className="text-sm font-medium text-foreground">{activeDelivery?.packageType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="Weight" size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Weight</p>
              <p className="text-sm font-medium text-foreground">{activeDelivery?.weight}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="MapPin" size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Distance</p>
              <p className="text-sm font-medium text-foreground">{activeDelivery?.distance || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Icon name="Clock" size={16} className="text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">ETA</p>
              <p className="text-sm font-medium text-foreground">{activeDelivery?.eta}</p>
            </div>
          </div>
        </div>

        {!isLinehaulCourier ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-background rounded-lg">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="MapPin" size={16} color="var(--color-success)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">{locationLabel}</p>
                <p className="text-sm font-medium text-foreground">{locationAddress}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-background rounded-lg">
              <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="MapPinned" size={16} color="var(--color-accent)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">From Branch</p>
                <p className="text-sm font-medium text-foreground">{originBranchAddress || activeDelivery?.pickupAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-background rounded-lg">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="MapPin" size={16} color="var(--color-success)" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">To Branch</p>
                <p className="text-sm font-medium text-foreground">{destinationBranchAddress || activeDelivery?.deliveryAddress}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      {!isLinehaulCourier ? (
        <div className="bg-muted rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Icon name="User" size={16} />
            Customer Information
          </h4>
          <div className="flex items-center gap-3 mb-3">
            <Image
              src={activeDelivery?.customerImage}
              alt={activeDelivery?.customerImageAlt}
              className="w-12 h-12 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{activeDelivery?.customerName}</p>
              <p className="text-xs text-muted-foreground">{formatNepaliPhone(activeDelivery?.customerPhone) || activeDelivery?.customerPhone}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                iconName="Phone"
                onClick={() => window.open(`tel:${activeDelivery?.customerPhone}`)}
              />
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  iconName="MessageSquare"
                  onClick={() => onMessage?.(activeDelivery)}
                  disabled={!canChat}
                  title={!canChat ? chatDisabledReason || 'Chat not available for this stage' : 'Open chat'}
                />
                {chatUnreadCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-error px-1 text-[10px] font-semibold leading-4 text-error-foreground text-center">
                    {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {!canChat && chatDisabledReason ? (
            <p className="text-[11px] text-muted-foreground mt-2">{chatDisabledReason}</p>
          ) : null}
        </div>
      ) : null}
      {activeDelivery?.specialInstructions && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Icon name="AlertTriangle" size={18} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground mb-1">Special Instructions</h4>
              <p className="text-sm text-muted-foreground">{activeDelivery?.specialInstructions}</p>
            </div>
          </div>
        </div>
      )}
      {hasPaymentInfo ? (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Icon name="Receipt" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground mb-2">Payment Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Method</p>
                  <p className="font-medium text-foreground">{paymentMethodLabel || 'Not provided'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-medium text-foreground">{formatRsAmount(paymentTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium text-foreground">{paymentStatusLabel || 'Unknown'}</p>
                </div>
              </div>
              {shouldCollectCashNow ? (
                <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Cash on Pickup: collect {formatRsAmount(cashToCollect)} from sender before confirming pickup.
                </div>
              ) : null}
              {isCashOnPickup && !shouldCollectCashNow ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Cash on Pickup is handled at pickup stage.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {!showProofCapture ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="default"
            size="default"
            fullWidth
            iconName="Navigation"
            iconPosition="left"
            onClick={() => {
              const navigationUrl = buildGoogleMapsNavigationUrl();
              if (!navigationUrl) {
                return;
              }
              window.open(navigationUrl, '_blank');
            }}
            disabled={!hasNavigationDestination}
          >
            Navigate
          </Button>
          <Button
            variant="success"
            size="default"
            fullWidth
            iconName={requiresProof ? 'Camera' : 'CheckCircle2'}
            iconPosition="left"
            onClick={() => {
              if (requiresProof) {
                setShowProofCapture(true);
                return;
              }
              onCompleteDelivery?.(activeDelivery?.id);
            }}
            disabled={!canProgress}
          >
            {requiresProof ? 'Capture Proof' : progressLabel}
          </Button>
          {incidentAction ? (
            <Button
              variant="danger"
              size="default"
              fullWidth
              iconName="AlertTriangle"
              iconPosition="left"
              onClick={() => onRequestIncident?.(activeDelivery, incidentAction)}
            >
              {incidentAction?.label || 'Request Cancellation'}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4">
            <h4 className="text-sm font-semibold text-foreground mb-3">Delivery Proof</h4>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Photo Evidence</label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-smooth cursor-pointer">
                  <Icon name="Camera" size={32} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">Click to capture photo</p>
                  <p className="text-xs text-muted-foreground">or drag and drop</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Customer Signature</label>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-smooth cursor-pointer">
                  <Icon name="PenTool" size={32} className="mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">Capture signature</p>
                  <p className="text-xs text-muted-foreground">Customer must sign here</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block">Additional Notes</label>
                <textarea
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows="3"
                  placeholder="Add any additional notes about the delivery..."
                  value={proofData?.notes}
                  onChange={(e) => setProofData({ ...proofData, notes: e?.target?.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="default"
              fullWidth
              onClick={() => setShowProofCapture(false)}
            >
              Cancel
            </Button>
            <Button
              variant="success"
              size="default"
              fullWidth
              iconName="CheckCircle2"
              iconPosition="left"
              onClick={handleProofSubmit}
            >
              Complete Delivery
            </Button>
          </div>
        </div>
      )}
      {isPendingLoadConfirmation ? (
        <p className="mt-3 text-xs text-warning">
          Pending load confirmation. Confirm loading from Trip/Navigation before starting transit.
        </p>
      ) : null}
    </div>
  );
};

export default ActiveDeliverySection;
