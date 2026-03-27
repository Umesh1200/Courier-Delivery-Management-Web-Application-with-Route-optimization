import React from 'react';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import Button from '../../../components/ui/Button';
import { formatNepaliPhone } from '../../../utils/format';

const CourierInfo = ({
  courier,
  onMessage,
  showMessageAction = true,
  canMessage = true,
  messageDisabledReason = ''
}) => {
  const courierName = String(courier?.name || '').trim() || 'Unassigned';
  const courierPhone = String(courier?.phone || '').trim();
  const hasAssignedCourier = courierName !== 'Unassigned';
  const hasCallablePhone = hasAssignedCourier && courierPhone !== '';
  const courierRating = courier?.rating || '0.0';
  const totalDeliveries = courier?.totalDeliveries || '0';
  const completedDeliveries = courier?.completedDeliveries || '0';
  const experience = courier?.experience || '0 years';
  const vehicleType = String(courier?.vehicleType || '').trim() || 'Assigned Vehicle';
  const vehicleNumber = String(courier?.vehicleNumber || '').trim() || 'N/A';
  const vehicleLabel = `${vehicleType} | ${vehicleNumber}`;
  const phoneLabel = formatNepaliPhone(courierPhone) || courierPhone || 'Phone unavailable';

  const handleCall = () => {
    if (!hasCallablePhone) {
      return;
    }
    window.location.href = `tel:${courierPhone}`;
  };

  const handleMessage = () => {
    onMessage?.();
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="User" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-semibold text-foreground">Your Courier</h3>
            <p className="text-xs md:text-sm text-muted-foreground">Assigned delivery partner</p>
          </div>
        </div>
      </div>
      <div className="p-4 md:p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-muted">
              <Image
                src={courier?.avatar}
                alt={courier?.avatarAlt}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-success rounded-full border-2 border-card flex items-center justify-center">
              <Icon name="Check" size={12} color="white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-base md:text-lg font-semibold text-foreground mb-1">{courierName}</h4>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                <Icon name="Star" size={14} color="var(--color-warning)" fill="var(--color-warning)" />
                <span className="text-sm font-medium text-foreground">{courierRating}</span>
              </div>
              <span className="text-xs text-muted-foreground">({totalDeliveries} deliveries)</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="Truck" size={14} />
              <span>{vehicleLabel}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{phoneLabel}</p>
          </div>
        </div>

        <div className={`grid ${showMessageAction ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
          <Button
            variant="outline"
            size="default"
            fullWidth
            iconName="Phone"
            iconPosition="left"
            onClick={handleCall}
            disabled={!hasCallablePhone}
          >
            Call
          </Button>
          {showMessageAction ? (
            <Button
              variant="default"
              size="default"
              fullWidth
              iconName="MessageCircle"
              iconPosition="left"
              onClick={handleMessage}
              disabled={!hasAssignedCourier || !canMessage}
              title={!hasAssignedCourier ? 'No courier assigned yet' : (canMessage ? '' : messageDisabledReason)}
            >
              Message
            </Button>
          ) : null}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-success/10 rounded-lg flex items-center justify-center">
                <Icon name="CheckCircle2" size={20} color="var(--color-success)" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Completed</p>
              <p className="text-sm md:text-base font-semibold text-foreground">{completedDeliveries}</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 bg-primary/10 rounded-lg flex items-center justify-center">
                <Icon name="Award" size={20} color="var(--color-primary)" />
              </div>
              <p className="text-xs text-muted-foreground mb-0.5">Experience</p>
              <p className="text-sm md:text-base font-semibold text-foreground">{experience}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourierInfo;
