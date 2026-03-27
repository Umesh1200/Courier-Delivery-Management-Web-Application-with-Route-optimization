import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import { Checkbox } from '../../../components/ui/Checkbox';

const BillingAddressForm = ({ billingAddress, onChange, errors }) => {
  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-success/10 rounded-lg flex items-center justify-center">
          <Icon name="MapPin" size={20} color="var(--color-success)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-foreground">Billing Address</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Enter your billing information</p>
        </div>
      </div>
      <div className="mb-4">
        <Checkbox
          id="same-as-pickup"
          checked={billingAddress?.sameAsPickup}
          onChange={(e) => onChange('sameAsPickup', e?.target?.checked)}
          label="Same as pickup address"
        />
      </div>
      {!billingAddress?.sameAsPickup && (
        <div className="space-y-4">
          <Input
            label="Street Address"
            placeholder="123 Main Street"
            value={billingAddress?.street}
            onChange={(e) => onChange('street', e?.target?.value)}
            error={errors?.billingStreet}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="City"
              placeholder="San Francisco"
              value={billingAddress?.city}
              onChange={(e) => onChange('city', e?.target?.value)}
              error={errors?.billingCity}
              required
            />

            <Input
              label="Province"
              placeholder="ON"
              value={billingAddress?.province}
              onChange={(e) => onChange('province', e?.target?.value)}
              error={errors?.billingProvince}
              required
            />
          </div>

          <Input
            label="Postal Code"
            placeholder="M5V 2T6"
            value={billingAddress?.postalCode}
            onChange={(e) => onChange('postalCode', e?.target?.value)}
            error={errors?.billingPostalCode}
            required
          />
        </div>
      )}
      {billingAddress?.sameAsPickup && (
        <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
          <Icon name="Info" size={20} color="var(--color-primary)" className="mt-0.5" />
          <div>
            <p className="text-sm text-foreground">
              Billing address will be the same as your pickup address
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingAddressForm;
