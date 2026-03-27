import React from 'react';
import Icon from '../../../components/AppIcon';

const MetricsCard = ({ title, value, change, changeType, icon, iconColor, trend }) => {
  const getChangeColor = () => {
    if (changeType === 'positive') return 'text-success';
    if (changeType === 'negative') return 'text-error';
    return 'text-muted-foreground';
  };

  const getChangeIcon = () => {
    if (changeType === 'positive') return 'TrendingUp';
    if (changeType === 'negative') return 'TrendingDown';
    return 'Minus';
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm hover:shadow-elevation-md transition-smooth">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <h3 className="text-2xl md:text-3xl font-semibold text-foreground">{value}</h3>
        </div>
        <div 
          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}15` }}
        >
          <Icon name={icon} size={24} color={iconColor} />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1 ${getChangeColor()}`}>
          <Icon name={getChangeIcon()} size={16} />
          <span className="text-sm font-medium">{change}</span>
        </div>
        <span className="text-sm text-muted-foreground">vs last month</span>
      </div>

      {trend && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">This week</span>
            <span className="font-medium text-foreground">{trend}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricsCard;