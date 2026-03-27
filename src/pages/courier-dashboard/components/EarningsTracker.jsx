import React, { useState } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';

const EarningsTracker = ({ earningsData, courierRole }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('daily');
  const roleLabel = courierRole === 'pickup'
    ? 'Pickup'
    : courierRole === 'linehaul'
      ? 'Linehaul'
      : courierRole === 'delivery'
        ? 'Delivery'
        : 'Delivery';
  const roleNoun = roleLabel.toLowerCase();
  const rolePlural = courierRole === 'delivery' || roleLabel === 'Delivery'
    ? 'deliveries'
    : `${roleNoun}s`;

  const periods = [
    { id: 'daily', label: 'Today', icon: 'Calendar' },
    { id: 'weekly', label: 'This Week', icon: 'CalendarDays' },
    { id: 'monthly', label: 'This Month', icon: 'CalendarRange' }
  ];

  const currentData = earningsData?.[selectedPeriod];
  const deliveriesCount = currentData?.deliveries || 0;
  const baseEarnings = Number(currentData?.base || 0);
  const bonusEarnings = Number(currentData?.bonuses || 0);
  const totalEarnings = Number(currentData?.total || 0);
  const perDelivery = deliveriesCount > 0 ? (baseEarnings / deliveriesCount) : 0;
  const bonusRate = baseEarnings > 0 ? Math.round((bonusEarnings / baseEarnings) * 100) : 0;

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center">
            <Icon name="NepalRupee" size={20} color="var(--color-success)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">{roleLabel} Earnings</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Track your income and bonuses</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {periods?.map((period) => (
          <button
            key={period?.id}
            onClick={() => setSelectedPeriod(period?.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-smooth flex-shrink-0 ${
              selectedPeriod === period?.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Icon name={period?.icon} size={16} />
            <span>{period?.label}</span>
          </button>
        ))}
      </div>
      <div className="bg-gradient-to-br from-success/10 to-success/5 rounded-xl p-4 md:p-6 mb-6 border border-success/20">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">Total Earnings</p>
          <Icon name="TrendingUp" size={16} className="text-success" />
        </div>
        <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
          RS {totalEarnings.toFixed(2)}
        </h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-success/20 text-success text-xs font-medium rounded-md">
            +{currentData?.growth}%
          </span>
          <span className="text-xs text-muted-foreground">vs last {selectedPeriod === 'daily' ? 'day' : selectedPeriod === 'weekly' ? 'week' : 'month'}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Package" size={18} color="var(--color-primary)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Base Earnings</p>
              <p className="text-lg md:text-xl font-semibold text-foreground">RS {baseEarnings.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{deliveriesCount} {rolePlural}</span>
            <span className="text-foreground font-medium">RS {perDelivery.toFixed(2)}/{roleNoun}</span>
          </div>
        </div>

        <div className="bg-muted rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center">
              <Icon name="Zap" size={18} color="var(--color-accent)" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Bonuses</p>
              <p className="text-lg md:text-xl font-semibold text-foreground">RS {bonusEarnings.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Performance rewards</span>
            <span className="text-accent font-medium">+{bonusRate}%</span>
          </div>
        </div>
      </div>
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-semibold text-foreground">Earnings Breakdown</h4>
        {currentData?.breakdown?.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-background rounded-lg flex items-center justify-center">
                <Icon name={item?.icon} size={16} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item?.type}</p>
                <p className="text-xs text-muted-foreground">{item?.count} {rolePlural}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">RS {item?.amount?.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{item?.percentage}%</p>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="Target" size={18} color="var(--color-primary)" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground mb-1">Next Bonus Milestone</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Complete {currentData?.nextMilestone?.remaining} more {rolePlural} to earn RS {currentData?.nextMilestone?.bonus?.toFixed(2)} bonus
            </p>
            <div className="w-full bg-background rounded-full h-2 mb-2">
              <div
                className="bg-primary h-2 rounded-full transition-smooth"
                style={{ width: `${currentData?.nextMilestone?.progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{currentData?.nextMilestone?.progress}% complete</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          iconName="Download"
          iconPosition="left"
          onClick={() => console.log('Download report')}
        >
          Download Report
        </Button>
        <Button
          variant="outline"
          size="sm"
          fullWidth
          iconName="FileText"
          iconPosition="left"
          onClick={() => console.log('View details')}
        >
          View Details
        </Button>
      </div>
    </div>
  );
};

export default EarningsTracker;


