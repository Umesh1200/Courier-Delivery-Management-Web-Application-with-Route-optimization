import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const BookingTableRow = ({
  booking,
  onTrack,
  onViewProof,
  onRatePickup,
  onRateDelivery,
  onRepeat,
  onPayFine,
  isPayFineBusy = false
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeliveryCodeCopied, setIsDeliveryCodeCopied] = useState(false);
  const menuRef = useRef(null);
  const deliveryCodeResetTimeoutRef = useRef(null);
  const fineStatusCode = String(booking?.fine?.status || '').trim().toLowerCase();
  const deliveryAccessCode = String(booking?.deliveryAccessCode || '').trim();
  const hasDeliveryAccessCode = deliveryAccessCode.length > 0;
  const canPayFine = fineStatusCode === 'pending' && Number(booking?.bookingId) > 0;
  const canRatePickup = ['picked_up', 'in_transit_to_origin_branch', 'received_at_origin_branch', 'linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_destination_branch', 'delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending', 'returned_to_sender'].includes(booking?.statusCode)
    && !booking?.pickupRated
    && booking?.pickupCourierId;
  const canRateDelivery = booking?.statusCode === 'delivered'
    && !booking?.deliveryRated
    && booking?.deliveryCourierId;

  const formatFineStatus = (value) => {
    if (value === 'pending') {
      return 'Pending';
    }
    if (value === 'applied') {
      return 'Paid';
    }
    if (value === 'waived') {
      return 'Waived';
    }
    return value ? value.replaceAll('_', ' ') : 'N/A';
  };

  const getStatusColor = (status) => {
    const colors = {
      'In Transit': 'var(--color-primary)',
      Delivered: 'var(--color-success)',
      Pending: 'var(--color-warning)',
      Cancelled: 'var(--color-error)',
      'On Hold': 'var(--color-warning)',
      Processing: 'var(--color-secondary)',
    };
    return colors?.[status] || 'var(--color-muted-foreground)';
  };

  const getStatusIcon = (status) => {
    const icons = {
      'In Transit': 'Truck',
      Delivered: 'CheckCircle',
      Pending: 'Clock',
      Cancelled: 'XCircle',
      'On Hold': 'AlertTriangle',
      Processing: 'Package',
    };
    return icons?.[status] || 'Package';
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef?.current && !menuRef.current.contains(event?.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => () => {
    if (deliveryCodeResetTimeoutRef.current) {
      window.clearTimeout(deliveryCodeResetTimeoutRef.current);
      deliveryCodeResetTimeoutRef.current = null;
    }
  }, []);

  const handleMenuAction = (action) => {
    setIsMenuOpen(false);
    action?.();
  };

  const handleCopyDeliveryCode = async () => {
    if (!hasDeliveryAccessCode) {
      return;
    }
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(deliveryAccessCode);
        copied = true;
      }
    } catch (error) {
      copied = false;
    }

    if (!copied) {
      try {
        const hiddenTextarea = document.createElement('textarea');
        hiddenTextarea.value = deliveryAccessCode;
        hiddenTextarea.setAttribute('readonly', '');
        hiddenTextarea.style.position = 'absolute';
        hiddenTextarea.style.left = '-9999px';
        document.body.appendChild(hiddenTextarea);
        hiddenTextarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(hiddenTextarea);
      } catch (error) {
        copied = false;
      }
    }

    if (!copied) {
      return;
    }

    setIsDeliveryCodeCopied(true);
    if (deliveryCodeResetTimeoutRef.current) {
      window.clearTimeout(deliveryCodeResetTimeoutRef.current);
    }
    deliveryCodeResetTimeoutRef.current = window.setTimeout(() => {
      setIsDeliveryCodeCopied(false);
      deliveryCodeResetTimeoutRef.current = null;
    }, 1400);
  };

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-smooth">
      <td className="px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center gap-2 md:gap-3">
          <div
            className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${getStatusColor(booking?.status)}15` }}
          >
            <Icon
              name={getStatusIcon(booking?.status)}
              size={16}
              color={getStatusColor(booking?.status)}
              className="md:w-5 md:h-5"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm font-medium text-foreground whitespace-nowrap">
              {booking?.trackingNumber}
            </p>
            <p className="text-xs text-muted-foreground hidden md:block">{booking?.date}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 md:px-4 md:py-4 hidden lg:table-cell">
        <div className="min-w-0">
          <p className="text-sm text-foreground line-clamp-1">{booking?.pickup}</p>
          <div className="flex items-center gap-1 mt-1">
            <Icon name="ArrowDown" size={12} color="var(--color-muted-foreground)" />
            <p className="text-xs text-muted-foreground line-clamp-1">{booking?.delivery}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 md:px-4 md:py-4 hidden md:table-cell">
        <p className="text-sm text-foreground">{booking?.packageType}</p>
      </td>
      <td className="px-3 py-3 md:px-4 md:py-4 align-top">
        <div className="w-[190px] max-w-[190px] space-y-2">
          <div
            className="inline-flex w-full items-center justify-between gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: `${getStatusColor(booking?.status)}15`,
              color: getStatusColor(booking?.status),
            }}
            title={booking?.status}
          >
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: getStatusColor(booking?.status) }}
              ></span>
              <span className="truncate">{booking?.status}</span>
            </span>
            {booking?.statusCode === 'picked_up' ? (
              <Icon
                name="Check"
                size={12}
                color={getStatusColor(booking?.status)}
                className="flex-shrink-0"
              />
            ) : null}
          </div>

          <div className="min-h-[16px] text-[11px] leading-4">
            {booking?.fine ? (
              <p className="text-muted-foreground whitespace-nowrap">
                Fine:{' '}
                <span className={`font-medium ${fineStatusCode === 'pending' ? 'text-warning' : 'text-success'}`}>
                  {formatFineStatus(fineStatusCode)}
                </span>
              </p>
            ) : (
              <p className="text-transparent select-none whitespace-nowrap">Fine: None</p>
            )}
          </div>

          <div className="min-h-[20px]">
            {canRatePickup ? (
              <button
                className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning hover:bg-warning/20"
                onClick={() => onRatePickup?.(booking)}
              >
                <Icon name="Star" size={11} />
                Rate Pickup
              </button>
            ) : null}
            {canRateDelivery ? (
              <button
                className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning hover:bg-warning/20"
                onClick={() => onRateDelivery?.(booking)}
              >
                <Icon name="Star" size={11} />
                Rate Delivery
              </button>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 md:px-4 md:py-4 hidden sm:table-cell">
        <p className="text-sm font-semibold text-foreground whitespace-nowrap">{booking?.amount}</p>
      </td>
      <td className="px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center gap-1 md:gap-2 relative" ref={menuRef}>
          <Button
            variant="ghost"
            size="xs"
            iconName="MapPin"
            onClick={() => onTrack(booking)}
            className="md:hidden"
          />
          <Button
            variant="outline"
            size="sm"
            iconName="MapPin"
            iconPosition="left"
            onClick={() => onTrack(booking)}
            className="hidden md:inline-flex"
          >
            Track
          </Button>
          {canPayFine ? (
            <Button
              variant="default"
              size="sm"
              iconName="Wallet"
              iconPosition="left"
              onClick={() => onPayFine?.(booking)}
              disabled={isPayFineBusy}
              className="hidden md:inline-flex"
            >
              {isPayFineBusy ? 'Paying...' : 'Pay Fine'}
            </Button>
          ) : null}
          {booking?.statusCode === 'delivered' && booking?.hasDeliveryProof ? (
            <Button
              variant="outline"
              size="sm"
              iconName="FileCheck"
              iconPosition="left"
              onClick={() => onViewProof?.(booking)}
              className="hidden md:inline-flex"
            >
              Proof
            </Button>
          ) : null}
          {canPayFine ? (
            <Button
              variant="ghost"
              size="xs"
              iconName="Wallet"
              onClick={() => onPayFine?.(booking)}
              disabled={isPayFineBusy}
              className="md:hidden"
            />
          ) : null}
          {canRatePickup ? (
            <Button
              variant="ghost"
              size="xs"
              iconName="Star"
              onClick={() => onRatePickup?.(booking)}
              className="md:hidden"
            />
          ) : null}
          {canRateDelivery ? (
            <Button
              variant="ghost"
              size="xs"
              iconName="Star"
              onClick={() => onRateDelivery?.(booking)}
              className="md:hidden"
            />
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            iconName="MoreVertical"
            onClick={() => {
              setIsDeliveryCodeCopied(false);
              setIsMenuOpen((open) => !open);
            }}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
          />
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-card shadow-elevation-md z-10">
              <button
                className="w-full px-3 py-2 text-left text-xs md:text-sm text-foreground hover:bg-muted transition-smooth"
                onClick={() => handleMenuAction(() => onTrack(booking))}
              >
                Track
              </button>
              {canPayFine ? (
                <button
                  className="w-full px-3 py-2 text-left text-xs md:text-sm text-foreground hover:bg-muted transition-smooth"
                  onClick={() => handleMenuAction(() => onPayFine?.(booking))}
                  disabled={isPayFineBusy}
                >
                  {isPayFineBusy ? 'Paying Fine...' : 'Pay Fine'}
                </button>
              ) : null}
              {booking?.statusCode === 'delivered' && booking?.hasDeliveryProof ? (
                <button
                  className="w-full px-3 py-2 text-left text-xs md:text-sm text-foreground hover:bg-muted transition-smooth"
                  onClick={() => handleMenuAction(() => onViewProof?.(booking))}
                >
                  View Proof
                </button>
              ) : null}
              {hasDeliveryAccessCode ? (
                <div className="border-t border-border px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Delivery Code</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 truncate rounded-md bg-muted/70 px-2 py-1 text-[11px] font-medium text-foreground">
                      {deliveryAccessCode}
                    </code>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted transition-smooth"
                      onClick={handleCopyDeliveryCode}
                    >
                      <Icon name={isDeliveryCodeCopied ? 'Check' : 'Copy'} size={11} />
                      {isDeliveryCodeCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                className="w-full px-3 py-2 text-left text-xs md:text-sm text-foreground hover:bg-muted transition-smooth"
                onClick={() => handleMenuAction(() => onRepeat(booking))}
              >
                Repeat Booking
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

export default BookingTableRow;
