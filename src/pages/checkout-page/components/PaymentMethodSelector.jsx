import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import { Checkbox } from '../../../components/ui/Checkbox';

const PaymentMethodSelector = ({ paymentData, onChange, errors }) => {
  const paymentMethods = [
    { id: 'credit-card', label: 'Credit Card', icon: 'CreditCard' },
    { id: 'debit-card', label: 'Debit Card', icon: 'CreditCard' },
    { id: 'khalti', label: 'Khalti Wallet', icon: 'Wallet' },
    { id: 'paypal', label: 'PayPal', icon: 'Wallet' },
    { id: 'apple-pay', label: 'Apple Pay', icon: 'Smartphone' },
    { id: 'google-pay', label: 'Google Pay', icon: 'Smartphone' },
    { id: 'cop', label: 'Cash on Pickup', icon: 'Banknote' }
  ];

  const handleCardNumberChange = (e) => {
    let value = e?.target?.value?.replace(/\s/g, '');
    value = value?.replace(/(.{4})/g, '$1 ')?.trim();
    onChange('cardNumber', value);
  };

  const handleExpiryChange = (e) => {
    let value = e?.target?.value?.replace(/\D/g, '');
    if (value?.length >= 2) {
      value = value?.slice(0, 2) + '/' + value?.slice(2, 4);
    }
    onChange('expiryDate', value);
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-accent/10 rounded-lg flex items-center justify-center">
          <Icon name="CreditCard" size={20} color="var(--color-accent)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-foreground">Payment Method</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Select your preferred payment method</p>
        </div>
      </div>
      {/* Payment Method Options */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {paymentMethods?.map((method) => (
          <button
            key={method?.id}
            type="button"
            onClick={() => onChange('paymentMethod', method?.id)}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
              paymentData?.paymentMethod === method?.id
                ? 'border-primary bg-primary/5' :'border-border hover:border-primary/50'
            }`}
          >
            <Icon name={method?.icon} size={24} color={paymentData?.paymentMethod === method?.id ? 'var(--color-primary)' : 'var(--color-muted-foreground)'} />
            <span className={`text-xs md:text-sm font-medium ${
              paymentData?.paymentMethod === method?.id ? 'text-primary' : 'text-foreground'
            }`}>
              {method?.label}
            </span>
          </button>
        ))}
      </div>
      {errors?.paymentMethod && (
        <p className="text-sm text-destructive mb-4">{errors?.paymentMethod}</p>
      )}
      {/* Card Details Form (shown for credit/debit card) */}
      {(paymentData?.paymentMethod === 'credit-card' || paymentData?.paymentMethod === 'debit-card') && (
        <div className="space-y-4 pt-4 border-t border-border">
          <Input
            label="Card Number"
            placeholder="1234 5678 9012 3456"
            value={paymentData?.cardNumber}
            onChange={handleCardNumberChange}
            error={errors?.cardNumber}
            required
            maxLength={19}
          />

          <Input
            label="Cardholder Name"
            placeholder="John Doe"
            value={paymentData?.cardName}
            onChange={(e) => onChange('cardName', e?.target?.value)}
            error={errors?.cardName}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Expiry Date"
              placeholder="MM/YY"
              value={paymentData?.expiryDate}
              onChange={handleExpiryChange}
              error={errors?.expiryDate}
              required
              maxLength={5}
            />

            <Input
              label="CVV"
              placeholder="123"
              type="password"
              value={paymentData?.cvv}
              onChange={(e) => onChange('cvv', e?.target?.value)}
              error={errors?.cvv}
              required
              maxLength={4}
            />
          </div>

          <Checkbox
            id="save-card"
            checked={paymentData?.saveCard}
            onChange={(e) => onChange('saveCard', e?.target?.checked)}
            label="Save this card for future bookings"
          />
        </div>
      )}
      {/* Digital Wallet Info */}
      {(paymentData?.paymentMethod === 'paypal' || paymentData?.paymentMethod === 'apple-pay' || paymentData?.paymentMethod === 'google-pay' || paymentData?.paymentMethod === 'khalti') && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
            <Icon name="Info" size={20} color="var(--color-primary)" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                You'll be redirected to {paymentData?.paymentMethod === 'paypal' ? 'PayPal' : paymentData?.paymentMethod === 'apple-pay' ? 'Apple Pay' : paymentData?.paymentMethod === 'google-pay' ? 'Google Pay' : 'Khalti'}
              </p>
              <p className="text-xs text-muted-foreground">
                Complete your payment securely through their platform
              </p>
            </div>
          </div>
        </div>
      )}

      {paymentData?.paymentMethod === 'cop' && (
        <div className="pt-4 border-t border-border">
          <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
            <Icon name="Info" size={20} color="var(--color-primary)" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Pay with cash on pickup</p>
              <p className="text-xs text-muted-foreground">
                Please keep the exact amount ready when your courier arrives
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodSelector;
