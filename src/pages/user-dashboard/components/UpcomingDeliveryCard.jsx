import React from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';

const UpcomingDeliveryCard = ({ delivery, onMessage }) => {
  const getTimeUntil = (scheduledTime) => {
    if (!scheduledTime) return 'TBD';
    const now = new Date();
    const scheduled = new Date(scheduledTime);
    const diffMs = scheduled - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      return `${Math.floor(diffHours / 24)} days`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`;
    } else {
      return `${diffMins} minutes`;
    }
  };

  const isUrgent = (scheduledTime) => {
    if (!scheduledTime) return false;
    const now = new Date();
    const scheduled = new Date(scheduledTime);
    const diffHours = (scheduled - now) / (1000 * 60 * 60);
    return diffHours <= 2;
  };

  return (
    <div
      className={`bg-card rounded-xl p-4 md:p-5 border transition-smooth hover:shadow-elevation-md ${
        isUrgent(delivery?.scheduledTime)
          ? 'border-warning shadow-elevation-sm'
          : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden flex-shrink-0">
          <Image
            src={delivery?.courierImage}
            alt={delivery?.courierImageAlt}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="text-sm md:text-base font-semibold text-foreground line-clamp-1">
              {delivery?.courierName}
            </h4>
            {isUrgent(delivery?.scheduledTime) && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-warning/10 rounded-full flex-shrink-0">
                <Icon name="AlertCircle" size={12} color="var(--color-warning)" />
                <span className="text-xs font-medium text-warning">Urgent</span>
              </div>
            )}
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mb-1">
            {delivery?.trackingNumber}
          </p>
          <div className="flex items-center gap-1 md:gap-2">
            <Icon name="Clock" size={14} color="var(--color-primary)" className="flex-shrink-0" />
            <span className="text-xs md:text-sm font-medium text-primary">
              Arriving in {getTimeUntil(delivery?.scheduledTime)}
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-2 md:space-y-3 mb-3 md:mb-4">
        <div className="flex items-start gap-2 md:gap-3">
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon name="MapPin" size={14} color="var(--color-primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-0.5">Delivery Address</p>
            <p className="text-xs md:text-sm text-foreground line-clamp-2">
              {delivery?.deliveryAddress}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-6 h-6 md:w-7 md:h-7 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
            <Icon name="Package" size={14} color="var(--color-secondary)" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs md:text-sm text-foreground">{delivery?.packageType}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-3 md:pt-4 border-t border-border">
        <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2.5 bg-primary text-primary-foreground rounded-lg text-xs md:text-sm font-medium hover:opacity-90 transition-smooth">
          <Icon name="Phone" size={16} />
          <span>Call Courier</span>
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 md:px-4 md:py-2.5 bg-muted text-foreground rounded-lg text-xs md:text-sm font-medium hover:bg-muted/80 transition-smooth disabled:opacity-60"
          onClick={() => onMessage?.(delivery)}
          disabled={!delivery?.courierName || delivery?.courierName === 'Unassigned'}
        >
          <Icon name="MessageSquare" size={16} />
          <span>Message</span>
        </button>
      </div>
    </div>
  );
};

export default UpcomingDeliveryCard;
