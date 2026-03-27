import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';

const PricingCalculator = ({ formData }) => {
  const [pricing, setPricing] = useState({
    baseRate: 0,
    distanceFee: 0,
    weightFee: 0,
    serviceFee: 0,
    additionalFees: 0,
    subtotal: 0,
    tax: 0,
    total: 0
  });

  useEffect(() => {
    calculatePricing();
  }, [formData]);

  const calculatePricing = () => {
    let baseRate = 500.00;
    let distanceFee = 0;
    let weightFee = 0;
    let serviceFee = 0;
    let additionalFees = 0;

    // Calculate distance fee
    const pickupLat = Number(formData?.pickupLat);
    const pickupLng = Number(formData?.pickupLng);
    const deliveryLat = Number(formData?.deliveryLat);
    const deliveryLng = Number(formData?.deliveryLng);
    if ([pickupLat, pickupLng, deliveryLat, deliveryLng].every(Number.isFinite)) {
      const toRad = (value) => (value * Math.PI) / 180;
      const earthRadius = 6371;
      const dLat = toRad(deliveryLat - pickupLat);
      const dLng = toRad(deliveryLng - pickupLng);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(pickupLat)) * Math.cos(toRad(deliveryLat)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadius * c;
      distanceFee = Math.min(distance * 2.5, 50);
    } else if (formData?.pickupPostalCode && formData?.deliveryPostalCode) {
      const distance = Math.abs(parseInt(formData?.pickupPostalCode) - parseInt(formData?.deliveryPostalCode)) / 100;
      distanceFee = Math.min(distance * 2.5, 50);
    }

    // Calculate weight fee
    if (formData?.weight) {
      const weight = parseFloat(formData?.weight);
      if (weight > 20) {
        weightFee = (weight - 20) * 1.5;
      }
    }

    // Service type fee
    switch (formData?.serviceType) {
      case 'same-day':
        serviceFee = 25.00;
        break;
      case 'express':
        serviceFee = 40.00;
        break;
      case 'next-day':
        serviceFee = 10.00;
        break;
      case 'scheduled':
        serviceFee = 5.00;
        break;
      default:
        serviceFee = 0;
    }

    // Additional options
    if (formData?.signatureRequired) additionalFees += 3.00;
    if (formData?.photoProof) additionalFees += 2.00;
    if (formData?.callBeforeDelivery) additionalFees += 1.50;
    if (formData?.fragileHandling) additionalFees += 5.00;
    const subtotal = baseRate + distanceFee + weightFee + serviceFee + additionalFees;
    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    setPricing({
      baseRate,
      distanceFee,
      weightFee,
      serviceFee,
      additionalFees,
      subtotal,
      tax,
      total
    });
  };

  const formatCurrency = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return 'RS 0.00';
    }
    return `RS ${value.toFixed(2)}`;
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 lg:p-8 shadow-elevation-md sticky top-20">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-accent/10 rounded-lg flex items-center justify-center">
          <Icon name="Calculator" size={20} color="var(--color-accent)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground">Price Breakdown</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Real-time pricing calculation</p>
        </div>
      </div>
      <div className="space-y-3 md:space-y-4">
        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Icon name="Package" size={16} color="var(--color-muted-foreground)" />
            <span className="text-sm text-muted-foreground">Base Rate</span>
          </div>
          <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.baseRate)}</span>
        </div>

        {pricing?.distanceFee > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="MapPin" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm text-muted-foreground">Distance Fee</span>
            </div>
            <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.distanceFee)}</span>
          </div>
        )}

        {pricing?.weightFee > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="Weight" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm text-muted-foreground">Weight Surcharge</span>
            </div>
            <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.weightFee)}</span>
          </div>
        )}

        {pricing?.serviceFee > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="Zap" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm text-muted-foreground">Service Fee</span>
            </div>
            <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.serviceFee)}</span>
          </div>
        )}

        {pricing?.additionalFees > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="Plus" size={16} color="var(--color-muted-foreground)" />
              <span className="text-sm text-muted-foreground">Additional Options</span>
            </div>
            <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.additionalFees)}</span>
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm font-medium text-foreground">Subtotal</span>
          <span className="text-sm font-semibold text-foreground">{formatCurrency(pricing?.subtotal)}</span>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Tax (8%)</span>
          <span className="text-sm font-medium text-foreground">{formatCurrency(pricing?.tax)}</span>
        </div>

        <div className="flex items-center justify-between py-3 md:py-4 bg-primary/10 rounded-lg px-3 md:px-4">
          <span className="text-base md:text-lg font-semibold text-foreground">Total</span>
          <span className="text-lg md:text-xl lg:text-2xl font-bold text-primary">{formatCurrency(pricing?.total)}</span>
        </div>
      </div>
      <div className="mt-4 md:mt-6 space-y-3">
        <div className="p-3 bg-success/10 rounded-lg">
          <div className="flex items-start gap-2">
            <Icon name="CheckCircle" size={16} color="var(--color-success)" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Price includes pickup, delivery, and basic tracking
            </p>
          </div>
        </div>

        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-start gap-2">
            <Icon name="Info" size={16} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Final price may vary based on actual package dimensions and route optimization
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 md:mt-6 grid grid-cols-3 gap-2 md:gap-3">
        <div className="text-center p-2 md:p-3 bg-muted rounded-lg">
          <Icon name="Shield" size={16} className="mx-auto mb-1 text-success" />
          <p className="text-xs font-medium text-foreground">Insured</p>
        </div>
        <div className="text-center p-2 md:p-3 bg-muted rounded-lg">
          <Icon name="Clock" size={16} className="mx-auto mb-1 text-primary" />
          <p className="text-xs font-medium text-foreground">On-Time</p>
        </div>
        <div className="text-center p-2 md:p-3 bg-muted rounded-lg">
          <Icon name="Star" size={16} className="mx-auto mb-1 text-accent" />
          <p className="text-xs font-medium text-foreground">Rated 4.8</p>
        </div>
      </div>
    </div>
  );
};

export default PricingCalculator;
