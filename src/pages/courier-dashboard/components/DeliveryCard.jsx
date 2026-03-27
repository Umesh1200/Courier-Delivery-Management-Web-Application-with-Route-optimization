import React from 'react';
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

const DeliveryCard = ({
  delivery,
  onUpdateStatus,
  onViewDetails,
  courierRole,
  onMessage,
  onRequestIncident,
  incidentAction = null,
  canChat = true,
  chatDisabledReason = '',
  chatUnreadCount = 0
}) => {
  const isLinehaulCourier = courierRole === 'linehaul';
  const getStatusColor = (status) => {
    const colors = {
      pickup_assigned: 'bg-warning/10 text-warning',
      linehaul_assigned: 'bg-warning/10 text-warning',
      linehaul_load_confirmed: 'bg-accent/10 text-accent',
      delivery_assigned: 'bg-warning/10 text-warning',
      delivery_load_confirmed: 'bg-accent/10 text-accent',
      picked_up: 'bg-accent/10 text-accent',
      in_transit_to_origin_branch: 'bg-primary/10 text-primary',
      linehaul_in_transit: 'bg-primary/10 text-primary',
      out_for_delivery: 'bg-secondary/10 text-secondary',
      delivery_attempt_failed: 'bg-warning/10 text-warning',
      waiting_for_reattempt: 'bg-warning/10 text-warning',
      rts_pending: 'bg-error/10 text-error',
      returned_to_sender: 'bg-error/10 text-error',
      delivered: 'bg-success/10 text-success',
      received_at_origin_branch: 'bg-success/10 text-success',
      received_at_destination_branch: 'bg-success/10 text-success',
      cancelled: 'bg-error/10 text-error'
    };
    return colors?.[status] || 'bg-muted text-muted-foreground';
  };

  const getStatusLabel = (status) => {
    if (status === 'received_at_origin_branch') {
      return 'ARRIVED AT ORIGIN BRANCH';
    }
    if (status === 'received_at_destination_branch') {
      return 'ARRIVED AT DESTINATION BRANCH';
    }
    if (status === 'linehaul_load_confirmed') {
      return 'LINEHAUL LOAD CONFIRMED';
    }
    if (status === 'delivery_load_confirmed') {
      return 'DELIVERY LOAD CONFIRMED';
    }
    return status?.replace(/[_-]/g, ' ')?.toUpperCase();
  };

  const getPriorityColor = (priority) => {
    const colors = {
      high: 'text-error',
      medium: 'text-warning',
      low: 'text-success'
    };
    return colors?.[priority] || 'text-muted-foreground';
  };

  const getNextAction = () => {
    const status = delivery?.status;
    const role = courierRole || 'both';
    const isPickup = role === 'pickup';
    const isLinehaul = role === 'linehaul';

    if (status === 'pickup_assigned') {
      return { label: 'Confirm Pickup', icon: 'CheckCircle', next: 'picked_up' };
    }
    if (status === 'picked_up') {
      if (isPickup || isLinehaul) {
        return { label: 'Start Transfer', icon: 'Truck', next: 'in_transit_to_origin_branch' };
      }
      return { label: 'Start Delivery', icon: 'Truck', next: 'in_transit_to_origin_branch' };
    }
    return null;
  };

  const nextAction = getNextAction();
  const currentStatusCode = String(delivery?.status || '').trim().toLowerCase();
  const normalizedCourierRole = String(courierRole || 'both').trim().toLowerCase();
  const shouldShowPendingLoadHint = !nextAction && (
    (currentStatusCode === 'linehaul_assigned' && (normalizedCourierRole === 'linehaul' || normalizedCourierRole === 'both'))
    || (currentStatusCode === 'delivery_assigned' && (normalizedCourierRole === 'delivery' || normalizedCourierRole === 'both'))
  );
  const paymentMethodLabel = formatPaymentMethodLabel(delivery?.paymentMethod, delivery?.paymentProvider);
  const paymentStatusLabel = formatPaymentStatusLabel(delivery?.paymentStatus);
  const paymentTotal = toNumberOrNull(delivery?.paymentTotal);
  const cashToCollect = toNumberOrNull(delivery?.cashToCollect);
  const isCashOnPickup = String(delivery?.paymentMethod || '').trim().toLowerCase() === 'cash';
  const shouldCollectCashNow = isCashOnPickup && String(delivery?.status || '').trim().toLowerCase() === 'pickup_assigned';
  const hasPaymentInfo = Boolean(paymentMethodLabel || paymentStatusLabel || paymentTotal !== null);

  const statusStage = delivery?.status;
  const afterPickupStages = [
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
    'delivered'
  ];
  const afterPickup = afterPickupStages.includes(statusStage);

  let primaryLabel = 'Pickup Location';
  let secondaryLabel = 'Delivery Address';
  let primaryAddress = delivery?.pickupAddress;
  let secondaryAddress = delivery?.deliveryAddress;
  let primaryIsDelivery = false;

  if (courierRole === 'pickup') {
    primaryLabel = 'Pickup Location';
    secondaryLabel = 'Destination';
  } else if (courierRole === 'delivery') {
    primaryLabel = 'Delivery Address';
    secondaryLabel = 'Pickup Origin';
    primaryAddress = delivery?.deliveryAddress;
    secondaryAddress = delivery?.pickupAddress;
    primaryIsDelivery = true;
  } else if (courierRole === 'linehaul') {
    primaryLabel = 'From Branch';
    secondaryLabel = 'To Branch';
    primaryAddress = formatBranchAddress(delivery?.originBranch) || delivery?.pickupAddress;
    secondaryAddress = formatBranchAddress(delivery?.destinationBranch) || delivery?.deliveryAddress;
  } else if (afterPickup) {
    primaryLabel = 'Delivery Address';
    secondaryLabel = 'Pickup Origin';
    primaryAddress = delivery?.deliveryAddress;
    secondaryAddress = delivery?.pickupAddress;
    primaryIsDelivery = true;
  }

  const primaryIcon = primaryIsDelivery
    ? { name: 'MapPin', color: 'var(--color-success)', bg: 'bg-success/10' }
    : { name: 'MapPinned', color: 'var(--color-accent)', bg: 'bg-accent/10' };
  const secondaryIcon = primaryIsDelivery
    ? { name: 'MapPinned', color: 'var(--color-accent)', bg: 'bg-accent/10' }
    : { name: 'MapPin', color: 'var(--color-success)', bg: 'bg-success/10' };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border hover:shadow-elevation-lg transition-smooth">
      <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 md:w-14 md:h-14 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="Package" size={24} color="var(--color-primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-base md:text-lg font-semibold text-foreground">
                {delivery?.trackingId}
              </h3>
              <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(delivery?.status)}`}>
                {getStatusLabel(delivery?.status)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-2">
              <Icon name="Clock" size={14} />
              <span>Est. {delivery?.estimatedTime}</span>
              <span className="mx-1">•</span>
              <Icon name={delivery?.priority === 'high' ? 'AlertCircle' : 'Info'} size={14} className={getPriorityColor(delivery?.priority)} />
              <span className={getPriorityColor(delivery?.priority)}>{delivery?.priority?.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <Icon name="NepalRupee" size={14} />
              <span className="font-medium text-foreground">RS {delivery?.earnings?.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            iconName="Eye"
            iconPosition="left"
            onClick={() => onViewDetails(delivery?.id)}
          >
            Details
          </Button>
        </div>
      </div>
      <div className="space-y-3 mb-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 ${primaryIcon.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon name={primaryIcon.name} size={16} color={primaryIcon.color} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{primaryLabel}</p>
            <p className="text-sm font-medium text-foreground line-clamp-2">{primaryAddress}</p>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-full h-px bg-border relative">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2">
              <Icon name="ArrowDown" size={16} className="text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 ${secondaryIcon.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            <Icon name={secondaryIcon.name} size={16} color={secondaryIcon.color} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{secondaryLabel}</p>
            <p className="text-sm font-medium text-foreground line-clamp-2">{secondaryAddress}</p>
          </div>
        </div>
      </div>
      <div className="bg-muted rounded-lg p-3 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Package Type</p>
            <p className="text-sm font-medium text-foreground">{delivery?.packageType}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Weight</p>
            <p className="text-sm font-medium text-foreground">{delivery?.weight}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Distance</p>
            <p className="text-sm font-medium text-foreground">{delivery?.distance}</p>
          </div>
        </div>
      </div>
      {hasPaymentInfo ? (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Receipt" size={15} color="var(--color-primary)" />
            <p className="text-xs font-medium text-primary">Payment Details</p>
          </div>
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
            <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
              Cash on Pickup: collect {formatRsAmount(cashToCollect)} from sender before confirming pickup.
            </div>
          ) : null}
          {isCashOnPickup && !shouldCollectCashNow ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Cash on Pickup is handled at pickup stage.
            </p>
          ) : null}
        </div>
      ) : null}
      {delivery?.specialInstructions && (
        <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <Icon name="AlertTriangle" size={16} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-warning mb-1">Special Instructions</p>
              <p className="text-xs text-foreground">{delivery?.specialInstructions}</p>
            </div>
          </div>
        </div>
      )}
      {!isLinehaulCourier ? (
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Image
              src={delivery?.customerImage}
              alt={delivery?.customerImageAlt}
              className="w-8 h-8 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{delivery?.customerName}</p>
              <p className="text-xs text-muted-foreground">{formatNepaliPhone(delivery?.customerPhone) || delivery?.customerPhone}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconName="Phone"
            onClick={() => window.open(`tel:${delivery?.customerPhone}`)}
          />
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              iconName="MessageSquare"
              onClick={() => onMessage?.(delivery)}
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
      ) : null}
      {!isLinehaulCourier && !canChat && chatDisabledReason ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{chatDisabledReason}</p>
      ) : null}
  {(nextAction || incidentAction) && (
        <div className="flex gap-2 mt-4">
          {nextAction ? (
          <Button
            variant={nextAction?.variant || 'default'}
            size="sm"
            fullWidth
            iconName={nextAction?.icon}
            iconPosition="left"
            onClick={() => onUpdateStatus(delivery?.id, nextAction?.next)}
          >
            {nextAction?.label}
          </Button>
          ) : null}
          {incidentAction ? (
            <Button
              variant="danger"
              size="sm"
              fullWidth
              iconName="AlertTriangle"
              iconPosition="left"
              onClick={() => onRequestIncident?.(delivery, incidentAction)}
            >
              {incidentAction?.label || 'Report Issue'}
            </Button>
          ) : null}
        </div>
      )}
      {shouldShowPendingLoadHint ? (
        <p className="mt-4 text-xs text-warning">
          Pending load confirmation. Continue from Trip/Navigation.
        </p>
      ) : null}
    </div>
  );
};

export default DeliveryCard;


