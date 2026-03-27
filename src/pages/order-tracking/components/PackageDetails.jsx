import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import { formatNepaliPhone } from '../../../utils/format';

const PackageDetails = ({ packageInfo }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-card rounded-xl shadow-elevation-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <Icon name="Package" size={20} color="var(--color-accent)" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-semibold text-foreground">Package Details</h3>
              <p className="text-xs md:text-sm text-muted-foreground">Booking #{packageInfo?.bookingId}</p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-muted rounded-lg transition-smooth"
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            <Icon name={isExpanded ? 'ChevronUp' : 'ChevronDown'} size={20} />
          </button>
        </div>
      </div>
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Package Type</p>
              <div className="flex items-center gap-2">
                <Icon name="Box" size={16} color="var(--color-primary)" />
                <span className="text-sm font-medium text-foreground">{packageInfo?.type}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Weight</p>
              <div className="flex items-center gap-2">
                <Icon name="Weight" size={16} color="var(--color-secondary)" />
                <span className="text-sm font-medium text-foreground">{packageInfo?.weight}</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Dimensions</p>
              <div className="flex items-center gap-2">
                <Icon name="Ruler" size={16} color="var(--color-accent)" />
                <span className="text-sm font-medium text-foreground">{packageInfo?.dimensions}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Delivery Fee</p>
              <div className="flex items-center gap-2">
                <Icon name="NepalRupee" size={16} color="var(--color-success)" />
                <span className="text-sm font-medium text-foreground">{packageInfo?.fee}</span>
              </div>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="pt-4 border-t border-border space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Recipient Information</p>
              <div className="bg-muted rounded-lg p-3 md:p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon name="User" size={16} color="var(--color-primary)" />
                  <span className="text-sm font-medium text-foreground">{packageInfo?.recipient?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="Phone" size={16} color="var(--color-secondary)" />
                  <span className="text-sm text-muted-foreground">
                    {formatNepaliPhone(packageInfo?.recipient?.phone) || packageInfo?.recipient?.phone}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Icon name="MapPin" size={16} color="var(--color-accent)" className="mt-0.5" />
                  <span className="text-sm text-muted-foreground">{packageInfo?.recipient?.address}</span>
                </div>
              </div>
            </div>

            {packageInfo?.specialInstructions && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Special Instructions</p>
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 md:p-4">
                  <div className="flex items-start gap-2">
                    <Icon name="AlertCircle" size={16} color="var(--color-warning)" className="mt-0.5" />
                    <p className="text-sm text-foreground">{packageInfo?.specialInstructions}</p>
                  </div>
                </div>
              </div>
            )}

            {packageInfo?.images && packageInfo?.images?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Package Images</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {packageInfo?.images?.map((img, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      <Image
                        src={img?.url}
                        alt={img?.alt}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PackageDetails;


