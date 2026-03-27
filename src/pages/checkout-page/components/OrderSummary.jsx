import React from 'react';
import Icon from '../../../components/AppIcon';
import { formatNepaliPhone } from '../../../utils/format';

const OrderSummary = ({ bookingData, pricing }) => {
  const formatCurrency = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return 'RS 0.00';
    }
    return `RS ${value.toFixed(2)}`;
  };

  const getServiceTypeLabel = (type) => {
    const labels = {
      'same-day': 'Same Day Delivery',
      'express': 'Express Delivery',
      'next-day': 'Next Day Delivery',
      'scheduled': 'Scheduled Delivery',
      'standard': 'Standard Delivery'
    };
    return labels?.[type] || type;
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md sticky top-20">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Icon name="Package" size={20} color="var(--color-primary)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-foreground">Order Summary</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Review your booking details</p>
        </div>
      </div>

      {/* Package Details */}
      <div className="space-y-4 mb-6">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Package Information</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Category:</span>
              <span className="text-foreground font-medium">{bookingData?.packageDetails?.category}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Size:</span>
              <span className="text-foreground font-medium">{bookingData?.packageDetails?.size}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Weight:</span>
              <span className="text-foreground font-medium">{bookingData?.packageDetails?.weight}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Pickup Location</h3>
          <div className="flex items-start gap-2">
            <Icon name="MapPin" size={16} color="var(--color-accent)" className="mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">{bookingData?.pickupAddress?.contactName}</p>
              <p className="text-muted-foreground">{bookingData?.pickupAddress?.street}</p>
              <p className="text-muted-foreground">
                {bookingData?.pickupAddress?.city}, {bookingData?.pickupAddress?.province} {bookingData?.pickupAddress?.postalCode}
              </p>
              <p className="text-muted-foreground">{formatNepaliPhone(bookingData?.pickupAddress?.phone) || bookingData?.pickupAddress?.phone}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Delivery Location</h3>
          <div className="flex items-start gap-2">
            <Icon name="MapPin" size={16} color="var(--color-success)" className="mt-0.5" />
            <div className="text-sm">
              <p className="text-foreground font-medium">{bookingData?.deliveryAddress?.contactName}</p>
              <p className="text-muted-foreground">{bookingData?.deliveryAddress?.street}</p>
              <p className="text-muted-foreground">
                {bookingData?.deliveryAddress?.city}, {bookingData?.deliveryAddress?.province} {bookingData?.deliveryAddress?.postalCode}
              </p>
              <p className="text-muted-foreground">{formatNepaliPhone(bookingData?.deliveryAddress?.phone) || bookingData?.deliveryAddress?.phone}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Service Details</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Service Type:</span>
              <span className="text-foreground font-medium">{getServiceTypeLabel(bookingData?.serviceType)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Scheduled Date:</span>
              <span className="text-foreground font-medium">{bookingData?.scheduledDate}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Time Slot:</span>
              <span className="text-foreground font-medium">{bookingData?.scheduledTime}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Price Breakdown */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Price Breakdown</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Base Rate:</span>
            <span className="text-foreground">{formatCurrency(pricing?.baseRate)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Distance Fee:</span>
            <span className="text-foreground">{formatCurrency(pricing?.distanceFee)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Service Fee:</span>
            <span className="text-foreground">{formatCurrency(pricing?.serviceFee)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Additional Fees:</span>
            <span className="text-foreground">{formatCurrency(pricing?.additionalFees)}</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="text-foreground font-medium">{formatCurrency(pricing?.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tax (8%):</span>
            <span className="text-foreground">{formatCurrency(pricing?.tax)}</span>
          </div>
          {pricing?.discount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-success">Discount:</span>
              <span className="text-success">-{formatCurrency(pricing?.discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-base font-semibold pt-3 border-t border-border">
            <span className="text-foreground">Total:</span>
            <span className="text-primary">{formatCurrency(pricing?.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
