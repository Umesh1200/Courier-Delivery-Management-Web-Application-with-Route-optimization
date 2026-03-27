import React from 'react';
import Icon from '../../../components/AppIcon';

const SummaryPaymentStep = ({ formData, paymentMethod, onPaymentChange, errors }) => {
  const paymentOptions = [
    {
      id: 'cop',
      label: 'Cash on Pickup',
      description: 'Pay the courier when your package is picked up.',
      icon: 'Banknote'
    },
    {
      id: 'khalti',
      label: 'Khalti Wallet',
      description: 'Secure online payment through Khalti.',
      icon: 'Wallet'
    }
  ];

  const formatValue = (value, fallback = 'N/A') => {
    if (value === undefined || value === null || String(value).trim() === '') {
      return fallback;
    }
    return value;
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon name="ClipboardList" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Summary</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Review your booking details before payment</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Package</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Category:</span> {formatValue(formData?.category)}</p>
              <p><span className="text-foreground font-medium">Size:</span> {formatValue(formData?.size)}</p>
              <p><span className="text-foreground font-medium">Weight:</span> {formatValue(formData?.weight)}</p>
              <p><span className="text-foreground font-medium">Description:</span> {formatValue(formData?.description)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Schedule</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Service:</span> {formatValue(formData?.serviceType)}</p>
              <p><span className="text-foreground font-medium">Date:</span> {formatValue(formData?.scheduledDate)}</p>
              <p><span className="text-foreground font-medium">Time:</span> {formatValue(formData?.scheduledTime)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Pickup</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Contact:</span> {formatValue(formData?.pickupContactName)}</p>
              <p><span className="text-foreground font-medium">Phone:</span> {formatValue(formData?.pickupPhone)}</p>
              <p><span className="text-foreground font-medium">Address:</span> {formatValue(formData?.pickupAddress)}</p>
              <p><span className="text-foreground font-medium">City:</span> {formatValue(formData?.pickupCity)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Delivery</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">Contact:</span> {formatValue(formData?.deliveryContactName)}</p>
              <p><span className="text-foreground font-medium">Phone:</span> {formatValue(formData?.deliveryPhone)}</p>
              <p><span className="text-foreground font-medium">Address:</span> {formatValue(formData?.deliveryAddress)}</p>
              <p><span className="text-foreground font-medium">City:</span> {formatValue(formData?.deliveryCity)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Instructions & Options</h3>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><span className="text-foreground font-medium">Special Instructions:</span> {formatValue(formData?.specialInstructions, 'None')}</p>
            <p><span className="text-foreground font-medium">Signature Required:</span> {formData?.signatureRequired ? 'Yes' : 'No'}</p>
            <p><span className="text-foreground font-medium">Photo Proof:</span> {formData?.photoProof ? 'Yes' : 'No'}</p>
            <p><span className="text-foreground font-medium">Call Before Delivery:</span> {formData?.callBeforeDelivery ? 'Yes' : 'No'}</p>
            <p><span className="text-foreground font-medium">Fragile Handling:</span> {formData?.fragileHandling ? 'Yes' : 'No'}</p>
            <p><span className="text-foreground font-medium">Insurance:</span> {formData?.insurance ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon name="CreditCard" size={20} color="var(--color-accent)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Payment Options</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Choose how you'd like to pay</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {paymentOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onPaymentChange(option.id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                paymentMethod === option.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center">
                  <Icon
                    name={option.icon}
                    size={20}
                    color={paymentMethod === option.id ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
                  />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${paymentMethod === option.id ? 'text-primary' : 'text-foreground'}`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {errors?.paymentMethod && (
          <p className="text-sm text-destructive mt-3">{errors.paymentMethod}</p>
        )}
      </div>
    </div>
  );
};

export default SummaryPaymentStep;
