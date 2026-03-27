import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import { Checkbox } from '../../../components/ui/Checkbox';

const SpecialInstructionsForm = ({ formData, errors, onChange }) => {
  const [charCount, setCharCount] = useState(formData?.specialInstructions?.length || 0);
  const maxChars = 500;

  const handleInstructionsChange = (e) => {
    const value = e?.target?.value;
    if (value?.length <= maxChars) {
      setCharCount(value?.length);
      onChange('specialInstructions', value);
    }
  };

  const handleCheckboxChange = (field, checked) => {
    onChange(field, checked);
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 lg:p-8 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-secondary/10 rounded-lg flex items-center justify-center">
          <Icon name="FileText" size={20} color="var(--color-secondary)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground">Special Instructions</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Add any specific delivery requirements</p>
        </div>
      </div>
      <div className="space-y-4 md:space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Delivery Instructions
          </label>
          <textarea
            className="w-full min-h-[120px] md:min-h-[150px] px-3 md:px-4 py-2 md:py-3 text-sm md:text-base bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none text-foreground placeholder:text-muted-foreground"
            placeholder="Example: Leave package at front door, Ring doorbell twice, Call upon arrival, etc."
            value={formData?.specialInstructions || ''}
            onChange={handleInstructionsChange}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              Provide clear instructions to help our courier deliver your package
            </p>
            <p className={`text-xs font-medium ${charCount > maxChars * 0.9 ? 'text-warning' : 'text-muted-foreground'}`}>
              {charCount}/{maxChars}
            </p>
          </div>
          {errors?.specialInstructions && (
            <p className="text-xs text-error mt-1">{errors?.specialInstructions}</p>
          )}
        </div>

        <div className="border border-border rounded-lg p-4 md:p-6 space-y-3 md:space-y-4">
          <h3 className="text-base md:text-lg font-semibold text-foreground">Additional Options</h3>
          
          <Checkbox
            label="Signature Required"
            description="Recipient must sign upon delivery"
            checked={formData?.signatureRequired || false}
            onChange={(e) => handleCheckboxChange('signatureRequired', e?.target?.checked)}
          />

          <Checkbox
            label="Photo Proof of Delivery"
            description="Courier will take a photo when delivered"
            checked={formData?.photoProof || false}
            onChange={(e) => handleCheckboxChange('photoProof', e?.target?.checked)}
          />

          <Checkbox
            label="Call Before Delivery"
            description="Courier will call recipient 15 minutes before arrival"
            checked={formData?.callBeforeDelivery || false}
            onChange={(e) => handleCheckboxChange('callBeforeDelivery', e?.target?.checked)}
          />

          <Checkbox
            label="Fragile - Handle with Care"
            description="Package contains delicate items requiring extra care"
            checked={formData?.fragileHandling || false}
            onChange={(e) => handleCheckboxChange('fragileHandling', e?.target?.checked)}
          />

          <Checkbox
            label="Insurance Coverage"
            description="Add insurance coverage for your package"
            checked={formData?.insurance || false}
            onChange={(e) => handleCheckboxChange('insurance', e?.target?.checked)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div className="p-3 md:p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="Shield" size={18} color="var(--color-success)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Secure Handling</p>
                <p className="text-muted-foreground">All packages are handled with professional care</p>
              </div>
            </div>
          </div>

          <div className="p-3 md:p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="Camera" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Delivery Verification</p>
                <p className="text-muted-foreground">Photo proof available for all deliveries</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3 md:p-4 bg-warning/10 rounded-lg">
          <div className="flex items-start gap-3">
            <Icon name="AlertTriangle" size={18} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
            <div className="text-xs md:text-sm">
              <p className="font-medium text-foreground mb-1">Important Note</p>
              <p className="text-muted-foreground">
                Special handling options may incur additional charges. Insurance is recommended for high-value items.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpecialInstructionsForm;
