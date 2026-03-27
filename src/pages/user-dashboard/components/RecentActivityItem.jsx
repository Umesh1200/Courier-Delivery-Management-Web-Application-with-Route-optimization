import React from 'react';
import Icon from '../../../components/AppIcon';

const RecentActivityItem = ({ activity }) => {
  const getActivityIcon = (type) => {
    const icons = {
      booking: 'PackagePlus',
      delivery: 'CheckCircle',
      payment: 'NepalRupee',
      rating: 'Star',
      cancellation: 'XCircle',
    };
    return icons?.[type] || 'Bell';
  };

  const getActivityColor = (type) => {
    const colors = {
      booking: 'var(--color-primary)',
      delivery: 'var(--color-success)',
      payment: 'var(--color-accent)',
      rating: 'var(--color-warning)',
      cancellation: 'var(--color-error)',
    };
    return colors?.[type] || 'var(--color-muted-foreground)';
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date('2026-01-03T10:28:12');
    const activityTime = new Date(timestamp);
    const diffMs = now - activityTime;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  return (
    <div className="flex items-start gap-3 md:gap-4 p-3 md:p-4 hover:bg-muted/50 rounded-lg transition-smooth">
      <div
        className="w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${getActivityColor(activity?.type)}15` }}
      >
        <Icon
          name={getActivityIcon(activity?.type)}
          size={16}
          color={getActivityColor(activity?.type)}
          className="md:w-5 md:h-5"
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs md:text-sm font-medium text-foreground mb-0.5 md:mb-1">
          {activity?.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{activity?.description}</p>
        <p className="text-xs text-muted-foreground">{getTimeAgo(activity?.timestamp)}</p>
      </div>
      {activity?.amount && (
        <div className="flex-shrink-0">
          <p className="text-xs md:text-sm font-semibold text-foreground whitespace-nowrap">
            {activity?.amount}
          </p>
        </div>
      )}
    </div>
  );
};

export default RecentActivityItem;

