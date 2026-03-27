import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const AvailabilityToggle = ({ initialStatus, onStatusChange, workedMinutes = 0, breakMinutes = 0, deliveriesToday = 0 }) => {
  const [isAvailable, setIsAvailable] = useState(initialStatus);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setIsAvailable(Boolean(initialStatus));
  }, [initialStatus]);

  const handleToggle = async () => {
    if (isUpdating) {
      return;
    }
    const newStatus = !isAvailable;
    setIsAvailable(newStatus);
    setIsUpdating(true);
    try {
      const ok = await onStatusChange?.(newStatus);
      if (ok === false) {
        setIsAvailable(!newStatus);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const scheduleSlots = [
    { time: '09:00 AM - 12:00 PM', status: 'available' },
    { time: '12:00 PM - 03:00 PM', status: 'break' },
    { time: '03:00 PM - 06:00 PM', status: 'available' },
    { time: '06:00 PM - 09:00 PM', status: 'unavailable' }
  ];

  const getStatusColor = (status) => {
    const colors = {
      available: 'bg-success/10 text-success border-success/20',
      break: 'bg-warning/10 text-warning border-warning/20',
      unavailable: 'bg-error/10 text-error border-error/20'
    };
    return colors?.[status] || 'bg-muted text-muted-foreground';
  };

  const formatHours = (minutes) => {
    const hours = minutes / 60;
    return hours % 1 === 0 ? `${hours.toFixed(0)} hrs` : `${hours.toFixed(1)} hrs`;
  };

  const formatMinutes = (minutes) => `${Math.max(0, minutes)} min`;

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isAvailable ? 'bg-success/10' : 'bg-error/10'
          }`}>
            <Icon
              name={isAvailable ? 'CheckCircle2' : 'XCircle'}
              size={20}
              color={isAvailable ? 'var(--color-success)' : 'var(--color-error)'}
            />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Availability Status</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              {isAvailable ? 'You are currently available' : 'You are currently unavailable'}
            </p>
          </div>
        </div>
      </div>
      <div className={`rounded-xl p-4 md:p-6 mb-6 border-2 transition-smooth ${
        isAvailable
          ? 'bg-success/5 border-success/20' :'bg-error/5 border-error/20'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isAvailable ? 'bg-success animate-pulse' : 'bg-error'}`} />
            <span className={`text-base md:text-lg font-semibold ${
              isAvailable ? 'text-success' : 'text-error'
            }`}>
              {isAvailable ? 'AVAILABLE FOR DELIVERIES' : 'NOT ACCEPTING DELIVERIES'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant={isAvailable ? 'destructive' : 'success'}
            size="default"
            fullWidth
            iconName={isAvailable ? 'XCircle' : 'CheckCircle2'}
            iconPosition="left"
            onClick={handleToggle}
            disabled={isUpdating}
          >
            {isUpdating ? 'Updating...' : (isAvailable ? 'Go Offline' : 'Go Online')}
          </Button>
          <Button
            variant="outline"
            size="default"
            fullWidth
            iconName="Calendar"
            iconPosition="left"
            onClick={() => setShowSchedule(!showSchedule)}
          >
            {showSchedule ? 'Hide Schedule' : 'View Schedule'}
          </Button>
        </div>
      </div>
      {showSchedule && (
        <div className="space-y-4 mb-6">
          <h4 className="text-sm font-semibold text-foreground">Today's Schedule</h4>
          <div className="space-y-2">
            {scheduleSlots?.map((slot, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(slot?.status)}`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    name={slot?.status === 'available' ? 'CheckCircle2' : slot?.status === 'break' ? 'Coffee' : 'XCircle'}
                    size={18}
                  />
                  <span className="text-sm font-medium">{slot?.time}</span>
                </div>
                <span className="text-xs font-medium uppercase">{slot?.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Clock" size={16} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Hours Today</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground">{formatHours(workedMinutes)}</p>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Package" size={16} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Deliveries Today</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground">{deliveriesToday}</p>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="Coffee" size={16} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Break Time</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-foreground">{formatMinutes(breakMinutes)}</p>
        </div>
      </div>
      {isAvailable && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-6">
          <div className="flex items-start gap-3">
            <Icon name="Info" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                You will receive new delivery assignments based on your location and availability. Make sure to keep your GPS enabled.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvailabilityToggle;
