import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';

const PromoCodeInput = ({ promoCode, setPromoCode, onApply, promoApplied }) => {
  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center">
          <Icon name="Tag" size={20} color="var(--color-warning)" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Promo Code</h2>
          <p className="text-xs text-muted-foreground">Have a discount code? Apply it here</p>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Enter promo code"
            value={promoCode}
            onChange={(e) => setPromoCode(e?.target?.value)}
            disabled={promoApplied}
          />
        </div>
        <Button
          variant={promoApplied ? 'success' : 'outline'}
          onClick={onApply}
          disabled={!promoCode || promoApplied}
          iconName={promoApplied ? 'Check' : 'Tag'}
          iconPosition="left"
        >
          {promoApplied ? 'Applied' : 'Apply'}
        </Button>
      </div>
      {promoApplied && (
        <div className="flex items-center gap-2 mt-3 text-sm text-success">
          <Icon name="CheckCircle" size={16} color="var(--color-success)" />
          <span>Promo code applied successfully!</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        Try code: <span className="font-mono font-medium text-foreground">SAVE10</span> for 10% off
      </p>
    </div>
  );
};

export default PromoCodeInput;