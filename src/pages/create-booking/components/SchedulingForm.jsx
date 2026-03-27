import React, { useMemo, useState, useEffect } from 'react';
import Icon from '../../../components/AppIcon';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';


const SchedulingForm = ({ formData, errors, onChange }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');

  const distanceKm = useMemo(() => {
    const pickupLat = Number(formData?.pickupLat);
    const pickupLng = Number(formData?.pickupLng);
    const deliveryLat = Number(formData?.deliveryLat);
    const deliveryLng = Number(formData?.deliveryLng);
    if (![pickupLat, pickupLng, deliveryLat, deliveryLng].every(Number.isFinite)) {
      return null;
    }
    const toRad = (value) => (value * Math.PI) / 180;
    const earthRadius = 6371;
    const dLat = toRad(deliveryLat - pickupLat);
    const dLng = toRad(deliveryLng - pickupLng);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(pickupLat)) * Math.cos(toRad(deliveryLat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }, [formData?.pickupLat, formData?.pickupLng, formData?.deliveryLat, formData?.deliveryLng]);

  const sameDayAllowed = distanceKm === null || distanceKm <= 20;

  useEffect(() => {
    if (!sameDayAllowed && formData?.serviceType === 'same-day') {
      onChange('serviceType', '');
    }
  }, [formData?.serviceType, onChange, sameDayAllowed]);

  const serviceTypes = [
    ...(sameDayAllowed ? [{ value: 'same-day', label: 'Same Day Delivery', description: 'Delivered within 6 hours - RS 25 extra' }] : []),
    { value: 'express', label: 'Express Delivery', description: 'Priority handling for urgent shipments - RS 40 extra' },
    { value: 'next-day', label: 'Next Day Delivery', description: 'Delivered by next business day - RS 10 extra' },
    { value: 'standard', label: 'Standard Delivery', description: '2-3 business days - Standard rate' },
    { value: 'scheduled', label: 'Scheduled Delivery', description: 'Choose specific date and time' }
  ];

  const timeSlots = [
    { value: '08:00-10:00', label: '8:00 AM - 10:00 AM', description: 'Morning slot' },
    { value: '10:00-12:00', label: '10:00 AM - 12:00 PM', description: 'Late morning' },
    { value: '12:00-14:00', label: '12:00 PM - 2:00 PM', description: 'Afternoon' },
    { value: '14:00-16:00', label: '2:00 PM - 4:00 PM', description: 'Late afternoon' },
    { value: '16:00-18:00', label: '4:00 PM - 6:00 PM', description: 'Evening' },
    { value: '18:00-20:00', label: '6:00 PM - 8:00 PM', description: 'Late evening' }
  ];

  const handleServiceTypeChange = (value) => {
    onChange('serviceType', value);
    if (value !== 'scheduled') {
      setSelectedDate('');
      setSelectedTimeSlot('');
      onChange('scheduledDate', '');
      onChange('scheduledTime', '');
    }
  };

  const handleDateChange = (e) => {
    const date = e?.target?.value;
    setSelectedDate(date);
    onChange('scheduledDate', date);
  };

  const handleTimeSlotChange = (value) => {
    setSelectedTimeSlot(value);
    onChange('scheduledTime', value);
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow?.setDate(tomorrow?.getDate() + 1);
    return tomorrow?.toISOString()?.split('T')?.[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate?.setDate(maxDate?.getDate() + 30);
    return maxDate?.toISOString()?.split('T')?.[0];
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 lg:p-8 shadow-elevation-md">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-success/10 rounded-lg flex items-center justify-center">
          <Icon name="Calendar" size={20} color="var(--color-success)" />
        </div>
        <div>
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground">Delivery Schedule</h2>
          <p className="text-xs md:text-sm text-muted-foreground">Choose when you want your package delivered</p>
        </div>
      </div>
      <div className="space-y-4 md:space-y-6">
        <Select
          label="Service Type"
          description="Select delivery speed and timing"
          options={serviceTypes}
          value={formData?.serviceType}
          onChange={handleServiceTypeChange}
          error={errors?.serviceType}
          required
          placeholder="Choose service type"
        />
        {!sameDayAllowed && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
            Same-day delivery is available only for distances up to 20 km.
          </div>
        )}

        {formData?.serviceType === 'scheduled' && (
          <div className="border border-border rounded-lg p-4 md:p-6 space-y-4">
            <h3 className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
              <Icon name="Clock" size={18} color="var(--color-primary)" />
              Select Date & Time
            </h3>

            <Input
              label="Delivery Date"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              error={errors?.scheduledDate}
              description="Choose a date within the next 30 days"
              required
              min={getMinDate()}
              max={getMaxDate()}
            />

            {selectedDate && (
              <Select
                label="Time Slot"
                description="Available delivery windows"
                options={timeSlots}
                value={selectedTimeSlot}
                onChange={handleTimeSlotChange}
                error={errors?.scheduledTime}
                required
                placeholder="Select time slot"
              />
            )}

            {selectedDate && selectedTimeSlot && (
              <div className="p-3 md:p-4 bg-success/10 rounded-lg">
                <div className="flex items-start gap-3">
                  <Icon name="CheckCircle" size={18} color="var(--color-success)" className="flex-shrink-0 mt-0.5" />
                  <div className="text-xs md:text-sm">
                    <p className="font-medium text-foreground mb-1">Scheduled Delivery Confirmed</p>
                    <p className="text-muted-foreground">
                      Your package will be delivered on {new Date(selectedDate)?.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} between {selectedTimeSlot?.replace('-', ' and ')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {formData?.serviceType === 'same-day' && (
          <div className="p-3 md:p-4 bg-warning/10 rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="Zap" size={18} color="var(--color-warning)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Same Day Delivery</p>
                <p className="text-muted-foreground">
                  Your package will be picked up within 2 hours and delivered within 6 hours. Available for orders placed before 2:00 PM.
                </p>
              </div>
            </div>
          </div>
        )}

        {formData?.serviceType === 'express' && (
          <div className="p-3 md:p-4 bg-error/10 rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="Zap" size={18} color="var(--color-error)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Express Delivery</p>
                <p className="text-muted-foreground">
                  Fast-track handling with highest priority. Best for time-critical shipments.
                </p>
              </div>
            </div>
          </div>
        )}

        {formData?.serviceType === 'next-day' && (
          <div className="p-3 md:p-4 bg-primary/10 rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="TrendingUp" size={18} color="var(--color-primary)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Next Day Delivery</p>
                <p className="text-muted-foreground">
                  Your package will be delivered by the next business day. Orders placed after 5:00 PM will be processed the following day.
                </p>
              </div>
            </div>
          </div>
        )}

        {formData?.serviceType === 'standard' && (
          <div className="p-3 md:p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <Icon name="Package" size={18} color="var(--color-secondary)" className="flex-shrink-0 mt-0.5" />
              <div className="text-xs md:text-sm">
                <p className="font-medium text-foreground mb-1">Standard Delivery</p>
                <p className="text-muted-foreground">
                  Your package will be delivered within 2-3 business days at our standard rate. Most economical option.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <div className="p-3 md:p-4 bg-card border border-border rounded-lg text-center">
            <Icon name="Clock" size={20} className="mx-auto mb-2 text-primary" />
            <p className="text-xs md:text-sm font-medium text-foreground">Flexible Timing</p>
            <p className="text-xs text-muted-foreground mt-1">Choose what works for you</p>
          </div>
          <div className="p-3 md:p-4 bg-card border border-border rounded-lg text-center">
            <Icon name="Bell" size={20} className="mx-auto mb-2 text-accent" />
            <p className="text-xs md:text-sm font-medium text-foreground">SMS Updates</p>
            <p className="text-xs text-muted-foreground mt-1">Real-time notifications</p>
          </div>
          <div className="p-3 md:p-4 bg-card border border-border rounded-lg text-center">
            <Icon name="Shield" size={20} className="mx-auto mb-2 text-success" />
            <p className="text-xs md:text-sm font-medium text-foreground">Guaranteed</p>
            <p className="text-xs text-muted-foreground mt-1">On-time delivery promise</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchedulingForm;
