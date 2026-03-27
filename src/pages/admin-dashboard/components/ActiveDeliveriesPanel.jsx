import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Image from '../../../components/AppImage';
import { buildApiUrl } from '../../../utils/api';

const ActiveDeliveriesPanel = ({ onOpenChat = null }) => {
  const [filter, setFilter] = useState('all');
  const [deliveries, setDeliveries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDeliveries = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/active-deliveries'));
      if (!res.ok) {
        throw new Error('Failed to load deliveries');
      }
      const data = await res.json();
      setDeliveries(data?.deliveries || []);
    } catch (err) {
      setError('Unable to load active deliveries right now.');
      setDeliveries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const getStatusConfig = (status) => {
    const configs = {
      'pickup': { label: 'Picking Up', color: 'var(--color-warning)', bg: 'bg-warning/10', icon: 'PackageSearch' },
      'linehaul': { label: 'Linehaul', color: 'var(--color-primary)', bg: 'bg-primary/10', icon: 'Truck' },
      'delivery': { label: 'Delivery', color: 'var(--color-secondary)', bg: 'bg-secondary/10', icon: 'Navigation' },
      'reattempt': { label: 'Waiting Reattempt', color: 'var(--color-warning)', bg: 'bg-warning/10', icon: 'RotateCcw' },
      'rts': { label: 'RTS', color: 'var(--color-error)', bg: 'bg-error/10', icon: 'CornerUpLeft' },
      'delivered': { label: 'Delivered', color: 'var(--color-success)', bg: 'bg-success/10', icon: 'CheckCircle' },
      'in-branch': { label: 'At Branch', color: 'var(--color-success)', bg: 'bg-success/10', icon: 'CheckCircle' }
    };
    return configs?.[status] || configs?.['linehaul'];
  };

  const getPriorityConfig = (priority) => {
    const configs = {
      'urgent': { label: 'Urgent', color: 'var(--color-error)', bg: 'bg-error/10' },
      'high': { label: 'High', color: 'var(--color-warning)', bg: 'bg-warning/10' },
      'normal': { label: 'Normal', color: 'var(--color-primary)', bg: 'bg-primary/10' }
    };
    return configs?.[priority] || configs?.['normal'];
  };

  const statusFilterMap = {
    pickup: ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'],
    linehaul: ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_origin_branch'],
    delivery: ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'received_at_destination_branch', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending']
  };

  const normalizeStatus = (status) => {
    if (['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'].includes(status)) {
      return 'pickup';
    }
    if (['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_origin_branch'].includes(status)) {
      return 'linehaul';
    }
    if (['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'received_at_destination_branch'].includes(status)) {
      return 'delivery';
    }
    if (status === 'delivery_attempt_failed' || status === 'waiting_for_reattempt') {
      return 'reattempt';
    }
    if (status === 'rts_pending' || status === 'returned_to_sender') {
      return 'rts';
    }
    if (status === 'delivered') {
      return 'delivered';
    }
    if (status === 'received_at_origin_branch' || status === 'received_at_destination_branch') {
      return 'in-branch';
    }
    return 'linehaul';
  };

  const filteredDeliveries = filter === 'all'
    ? deliveries
    : deliveries?.filter((d) => statusFilterMap?.[filter]?.includes(d?.status));

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Active Deliveries</h3>
          <p className="text-sm text-muted-foreground">Real-time delivery tracking</p>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-smooth ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`
            }>

            All ({deliveries?.length})
          </button>
          <button
            onClick={() => setFilter('pickup')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-smooth ${
            filter === 'pickup' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`
            }>

            Pickup ({deliveries?.filter((d) => ['pickup_assigned', 'picked_up', 'in_transit_to_origin_branch'].includes(d?.status))?.length})
          </button>
          <button
            onClick={() => setFilter('linehaul')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-smooth ${
            filter === 'linehaul' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`
            }>

            Linehaul ({deliveries?.filter((d) => ['linehaul_assigned', 'linehaul_load_confirmed', 'linehaul_in_transit', 'received_at_origin_branch'].includes(d?.status))?.length})
          </button>
          <button
            onClick={() => setFilter('delivery')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-smooth ${
            filter === 'delivery' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`
            }>

            Delivery ({deliveries?.filter((d) => ['delivery_assigned', 'delivery_load_confirmed', 'out_for_delivery', 'received_at_destination_branch', 'delivery_attempt_failed', 'waiting_for_reattempt', 'rts_pending'].includes(d?.status))?.length})
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {isLoading && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading active deliveries...
          </div>
        )}
        {!isLoading && error && (
          <div className="py-10 text-center text-sm text-error">
            {error}
          </div>
        )}
        {!isLoading && !error && filteredDeliveries?.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active deliveries found for this filter.
          </div>
        )}
        {filteredDeliveries?.map((delivery) => {
          const statusConfig = getStatusConfig(normalizeStatus(delivery?.status));
          const priorityConfig = getPriorityConfig(delivery?.priority);
          const bookingId = Number(delivery?.bookingId);
          const customerId = Number(delivery?.customerId);
          const courierId = Number(delivery?.courierId);
          const canMessageCustomer = Number.isFinite(customerId) && customerId > 0;
          const canMessageCourier = Number.isFinite(courierId) && courierId > 0;
          const openCustomerChat = () => {
            if (!Number.isFinite(bookingId) || bookingId <= 0 || typeof onOpenChat !== 'function') {
              return;
            }
            onOpenChat({
              bookingId,
              bookingCode: delivery?.bookingCode || delivery?.id,
              recipientId: customerId,
              recipientRole: 'customer',
              recipientLabel: delivery?.customer || 'Customer'
            });
          };
          const openCourierChat = () => {
            if (!Number.isFinite(bookingId) || bookingId <= 0 || typeof onOpenChat !== 'function') {
              return;
            }
            onOpenChat({
              bookingId,
              bookingCode: delivery?.bookingCode || delivery?.id,
              recipientId: courierId,
              recipientRole: 'courier',
              recipientLabel: delivery?.courier || 'Courier'
            });
          };

          return (
            <div key={delivery?.id} className="bg-muted/30 rounded-lg p-4 hover:bg-muted/50 transition-smooth">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={delivery?.courierAvatar}
                      alt={delivery?.courierAvatarAlt}
                      className="w-full h-full object-cover" />

                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-foreground">{delivery?.courier}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig?.bg}`} style={{ color: priorityConfig?.color }}>
                        {priorityConfig?.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Order #{delivery?.id} - {delivery?.customer}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusConfig?.bg}`}>
                      <Icon name={statusConfig?.icon} size={16} color={statusConfig?.color} />
                    </div>
                    <div>
                      <p className="text-xs font-medium" style={{ color: statusConfig?.color }}>{statusConfig?.label}</p>
                      <p className="text-xs text-muted-foreground">ETA: {delivery?.eta}</p>
                      <p className="text-xs text-muted-foreground">Distance: {delivery?.distance || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" iconName="MapPin" iconPosition="left">
                      Track
                    </Button>
                    <Button variant="ghost" size="sm" iconName="Phone" />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconName="MessageCircle"
                      onClick={openCustomerChat}
                      disabled={!canMessageCustomer}
                      title={canMessageCustomer ? 'Message customer' : 'Customer unavailable'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      iconName="MessageSquare"
                      onClick={openCourierChat}
                      disabled={!canMessageCourier}
                      title={canMessageCourier ? 'Message courier' : 'Courier unavailable'}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-foreground">{delivery?.progress}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${delivery?.progress}%` }}>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    <Icon name="MapPin" size={12} color="var(--color-muted-foreground)" />
                    <span className="text-xs text-muted-foreground line-clamp-1">{delivery?.pickup}</span>
                  </div>
                  <Icon name="ArrowRight" size={12} color="var(--color-muted-foreground)" />
                  <div className="flex items-center gap-1">
                    <Icon name="Home" size={12} color="var(--color-muted-foreground)" />
                    <span className="text-xs text-muted-foreground line-clamp-1">{delivery?.delivery}</span>
                  </div>
                </div>
              </div>
            </div>);

        })}
      </div>
      <div className="mt-4 pt-4 border-t border-border">
        <Button variant="outline" fullWidth iconName="RefreshCw" iconPosition="left" onClick={loadDeliveries}>
          Refresh Status
        </Button>
      </div>
    </div>);

};

export default ActiveDeliveriesPanel;
