import React from 'react';
import Icon from '../../../components/AppIcon';

const DeliveryTimeline = ({ timeline }) => {
  const getStatusIcon = (status) => {
    const icons = {
      completed: 'CheckCircle2',
      active: 'Circle',
      pending: 'Circle',
    };
    return icons?.[status] || 'Circle';
  };

  const getStatusColor = (status) => {
    const colors = {
      completed: 'var(--color-success)',
      active: 'var(--color-primary)',
      pending: 'var(--color-muted-foreground)',
    };
    return colors?.[status] || 'var(--color-muted-foreground)';
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Icon name="Clock" size={20} color="var(--color-primary)" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-semibold text-foreground">Delivery Progress</h3>
          <p className="text-xs md:text-sm text-muted-foreground">Track your package journey</p>
        </div>
      </div>
      <div className="space-y-6">
        {timeline?.map((item, index) => (
          <div key={item?.id} className="relative">
            {index !== timeline?.length - 1 && (
              <div
                className={`absolute left-5 top-12 w-0.5 h-full ${
                  item?.status === 'completed' ? 'bg-success' : 'bg-border'
                }`}
              />
            )}

            <div className="flex items-start gap-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item?.status === 'completed'
                    ? 'bg-success/10'
                    : item?.status === 'active' ?'bg-primary/10' :'bg-muted'
                }`}
              >
                <Icon
                  name={getStatusIcon(item?.status)}
                  size={20}
                  color={getStatusColor(item?.status)}
                  strokeWidth={item?.status === 'completed' ? 2.5 : 2}
                />
              </div>

              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm md:text-base font-semibold text-foreground">{item?.title}</h4>
                  {item?.timestamp && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{item?.timestamp}</span>
                  )}
                </div>
                <p className="text-xs md:text-sm text-muted-foreground mb-2">{item?.description}</p>
                {item?.location && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon name="MapPin" size={12} />
                    <span className="line-clamp-1">{item?.location}</span>
                  </div>
                )}
                {item?.status === 'active' && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-primary">In Progress</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DeliveryTimeline;
