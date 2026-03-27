import React, { useEffect, useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Image from '../../../components/AppImage';
import { buildApiUrl } from '../../../utils/api';

const ACTIVITY_TYPE_CONFIG = {
  user_registration: { icon: 'UserPlus', iconColor: 'var(--color-success)' },
  delivery_completed: { icon: 'CheckCircle', iconColor: 'var(--color-success)' },
  booking_created: { icon: 'PackagePlus', iconColor: 'var(--color-primary)' },
  payment_received: { icon: 'NepalRupee', iconColor: 'var(--color-success)' }
};

const EMPTY_COUNTS = {
  user_registration: 0,
  delivery_completed: 0,
  booking_created: 0,
  payment_received: 0
};

const escapeCsv = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const RecentActivityFeed = () => {
  const [filter, setFilter] = useState('all');
  const [activities, setActivities] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [limit, setLimit] = useState(8);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) {
      return 'Just now';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date?.getTime())) {
      return timestamp;
    }
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) {
      return 'Just now';
    }
    if (minutes < 60) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const fetchActivities = async (limitValue, filterValue) => {
    const params = new URLSearchParams({ limit: String(limitValue) });
    if (filterValue && filterValue !== 'all') {
      params.set('type', filterValue);
    }
    const res = await fetch(buildApiUrl(`/api/admin/recent-activity?${params.toString()}`));
    if (!res.ok) {
      throw new Error('Failed to load activity');
    }
    return res.json();
  };

  const loadActivities = async (limitValue, filterValue) => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchActivities(limitValue, filterValue);
      const mapped = (data?.activities || []).map((activity) => {
        const config = ACTIVITY_TYPE_CONFIG?.[activity?.type] || {
          icon: 'Activity',
          iconColor: 'var(--color-muted-foreground)'
        };
        return {
          ...activity,
          avatar: null,
          avatarAlt: null,
          icon: config.icon,
          iconColor: config.iconColor,
          rawTimestamp: activity?.timestamp,
          timestamp: formatTimeAgo(activity?.timestamp)
        };
      });
      setActivities(mapped);
      setCounts({
        user_registration: Number(data?.counts?.user_registration || 0),
        delivery_completed: Number(data?.counts?.delivery_completed || 0),
        booking_created: Number(data?.counts?.booking_created || 0),
        payment_received: Number(data?.counts?.payment_received || 0)
      });
    } catch (err) {
      setError('Unable to load recent activity right now.');
      setActivities([]);
      setCounts(EMPTY_COUNTS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivities(limit, filter);
  }, [limit, filter]);

  const totalCount = counts.user_registration +
    counts.delivery_completed +
    counts.booking_created +
    counts.payment_received;

  const filterOptions = [
    { value: 'all', label: 'All Activity', count: totalCount },
    { value: 'user_registration', label: 'Registrations', count: counts.user_registration },
    { value: 'delivery_completed', label: 'Deliveries', count: counts.delivery_completed },
    { value: 'booking_created', label: 'Bookings', count: counts.booking_created },
    { value: 'payment_received', label: 'Payments', count: counts.payment_received }
  ];

  const handleExport = async () => {
    setIsExporting(true);
    setError('');
    try {
      const activeFilterCount = filter === 'all' ? totalCount : Number(counts?.[filter] || 0);
      const exportLimit = Math.max(activeFilterCount || activities.length, 1);
      const data = await fetchActivities(exportLimit, filter);
      const exportRows = Array.isArray(data?.activities) ? data.activities : [];

      if (exportRows.length === 0) {
        setError('No activities available to export.');
        return;
      }

      const header = ['ID', 'Type', 'User', 'Action', 'Occurred At'];
      const csvLines = [
        header.join(','),
        ...exportRows.map((row) => ([
          escapeCsv(row?.id),
          escapeCsv(row?.type),
          escapeCsv(row?.user),
          escapeCsv(row?.action),
          escapeCsv(row?.timestamp)
        ].join(',')))
      ];

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `recent-activity-${filter}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Unable to export recent activity right now.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Platform events and user actions</p>
        </div>

        <Button
          variant="outline"
          iconName="Download"
          iconPosition="left"
          onClick={handleExport}
          disabled={isLoading || isExporting}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </div>
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-smooth flex items-center gap-1.5 ${
              filter === option.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {option.label}
            <span
              className={`px-1.5 py-0.5 rounded text-xs ${
                filter === option.value ? 'bg-primary-foreground/20' : 'bg-background'
              }`}
            >
              {option.count}
            </span>
          </button>
        ))}
      </div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {isLoading && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading recent activity...
          </div>
        )}
        {!isLoading && error && (
          <div className="py-10 text-center text-sm text-error">
            {error}
          </div>
        )}
        {activities.map((activity) => (
          <div key={activity?.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-smooth">
            {activity?.avatar ? (
              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                <Image
                  src={activity?.avatar}
                  alt={activity?.avatarAlt}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Icon name={activity?.icon} size={20} color={activity?.iconColor} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground mb-1">
                <span className="font-semibold">{activity?.user}</span> {activity?.action}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon name="Clock" size={12} />
                  {activity?.timestamp}
                </span>
              </div>
            </div>

            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${activity?.iconColor}15` }}
            >
              <Icon name={activity?.icon} size={16} color={activity?.iconColor} />
            </div>
          </div>
        ))}
      </div>
      {!isLoading && !error && activities.length === 0 && (
        <div className="py-12 text-center">
          <Icon name="Activity" size={48} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activities found for this filter</p>
        </div>
      )}
      <div className="mt-4 pt-4 border-t border-border">
        <Button
          variant="outline"
          fullWidth
          iconName="RefreshCw"
          iconPosition="left"
          onClick={() => setLimit((prev) => prev + 4)}
        >
          Load More Activities
        </Button>
      </div>
    </div>
  );
};

export default RecentActivityFeed;


