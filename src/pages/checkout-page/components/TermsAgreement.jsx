import React from 'react';
import { Checkbox } from '../../../components/ui/Checkbox';

const TermsAgreement = ({ termsAccepted, setTermsAccepted, privacyAccepted, setPrivacyAccepted, errors }) => {
  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-md">
      <h3 className="text-base font-semibold text-foreground mb-4">Terms & Conditions</h3>
      <div className="space-y-3">
        <div>
          <Checkbox
            id="terms-checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e?.target?.checked)}
            label={
              <span className="text-sm text-foreground">
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">
                  Terms of Service
                </a>
              </span>
            }
            error={errors?.terms}
          />
          {errors?.terms && (
            <p className="text-xs text-destructive mt-1 ml-6">{errors?.terms}</p>
          )}
        </div>

        <div>
          <Checkbox
            id="privacy-checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e?.target?.checked)}
            label={
              <span className="text-sm text-foreground">
                I agree to the{' '}
                <a href="#" className="text-primary hover:underline">
                  Privacy Policy
                </a>
              </span>
            }
            error={errors?.privacy}
          />
          {errors?.privacy && (
            <p className="text-xs text-destructive mt-1 ml-6">{errors?.privacy}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        By completing this booking, you authorize us to charge your selected payment method for the total amount shown.
      </p>
    </div>
  );
};

export default TermsAgreement;