import React from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';

const PackageDetailsForm = ({ formData, errors, onChange }) => {
  const packageCategories = [
    { value: 'documents', label: 'Documents', description: 'Papers, letters, contracts' },
    { value: 'electronics', label: 'Electronics', description: 'Phones, laptops, gadgets' },
    { value: 'clothing', label: 'Clothing & Textiles', description: 'Apparel, fabrics' },
    { value: 'food', label: 'Food & Beverages', description: 'Perishable items' },
    { value: 'fragile', label: 'Fragile Items', description: 'Glass, ceramics, artwork' },
    { value: 'other', label: 'Other', description: 'General items' }
  ];

  const packageSizes = [
    { value: 'small', label: 'Small', description: 'Up to 2.5 kg, fits in envelope' },
    { value: 'medium', label: 'Medium', description: '2.5-10 kg, shoebox size' },
    { value: 'large', label: 'Large', description: '10-25 kg, suitcase size' },
    { value: 'xlarge', label: 'Extra Large', description: '25+ kg, requires special handling' }
  ];

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 lg:p-8 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-lg flex items-center justify-center">
          <Icon name="Package" size={20} color="var(--color-primary)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground">Package Details</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Provide information about your package</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Select
          label="Package Category"
          description="Select the type of items you're sending"
          options={packageCategories}
          value={formData?.category}
          onChange={(value) => onChange('category', value)}
          error={errors?.category}
          required
          searchable
          placeholder="Choose category"
        />

        <Select
          label="Package Size"
          description="Approximate size and weight range"
          options={packageSizes}
          value={formData?.size}
          onChange={(value) => onChange('size', value)}
          error={errors?.size}
          required
          placeholder="Select size"
        />

        <Input
          label="Weight (kg)"
          type="number"
          placeholder="Enter weight"
          value={formData?.weight}
          onChange={(e) => onChange('weight', e?.target?.value)}
          error={errors?.weight}
          description="Accurate weight helps with pricing"
          required
          min="0.1"
          step="0.1"
        />

        <div className="md:col-span-2">
          <Input
            label="Package Description"
            type="text"
            placeholder="Brief description of contents"
            value={formData?.description}
            onChange={(e) => onChange('description', e?.target?.value)}
            error={errors?.description}
            description="Help us handle your package properly"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-foreground mb-2">
            Dimensions (Optional)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              placeholder="Length (cm)"
              value={formData?.length}
              onChange={(e) => onChange('length', e?.target?.value)}
              min="0"
              step="0.1"
            />
            <Input
              type="number"
              placeholder="Width (cm)"
              value={formData?.width}
              onChange={(e) => onChange('width', e?.target?.value)}
              min="0"
              step="0.1"
            />
            <Input
              type="number"
              placeholder="Height (cm)"
              value={formData?.height}
              onChange={(e) => onChange('height', e?.target?.value)}
              min="0"
              step="0.1"
            />
          </div>
        </div>
      </div>
      <div className="mt-4 md:mt-6 p-3 md:p-4 bg-muted rounded-lg">
        <div className="flex items-start gap-3">
          <Icon name="Info" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
          <div className="text-xs md:text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Packaging Tips:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Use sturdy boxes for fragile items</li>
              <li>Seal packages securely with tape</li>
              <li>Include padding for delicate contents</li>
              <li>Label fragile items clearly</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 md:mt-6 bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-3 md:p-4 border-b border-border">
          <h3 className="text-sm md:text-base font-semibold text-foreground">Incorrect Package Info - Fine System</h3>
          <p className="text-xs md:text-sm text-muted-foreground">Reason will be provided to the user.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Error Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Immediate Result</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Financial Result</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="px-3 py-3 text-sm text-foreground">Under-reported Weight</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Delayed sorting</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Pay extra to resume</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-3 text-sm text-foreground">Too Large for Vehicle</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Pickup Refusal</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Cancellation fee</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-3 text-sm text-foreground">Wrong Street Number</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Package held at hub</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Address correction fee</td>
              </tr>
              <tr className="border-t border-border">
                <td className="px-3 py-3 text-sm text-foreground">Wrong City/Postal Code</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">Rerouted to wrong state</td>
                <td className="px-3 py-3 text-sm text-muted-foreground">High rerouting costs + 3-5 day delay</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PackageDetailsForm;
