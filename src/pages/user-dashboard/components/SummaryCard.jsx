import React from 'react';
import Icon from '../../../components/AppIcon';

const SummaryCard = ({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  trend,
  trendValue,
  hint = '',
  actionLabel = '',
  onAction = null
}) => {
  const canShowAction = typeof onAction === 'function' && String(actionLabel || '').trim() !== '';

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm hover:shadow-elevation-md transition-smooth border border-border">
      <div className="flex items-start justify-between mb-3 md:mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs md:text-sm text-muted-foreground mb-1 md:mb-2">{title}</p>
          <h3 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-1">
            {value}
          </h3>
          {subtitle && (
            <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>
          )}
          {hint ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={hint}>
              <Icon name="Info" size={12} color="var(--color-muted-foreground)" />
              <span>{hint}</span>
            </p>
          ) : null}
        </div>
        <div
          className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${iconColor}15` }}
        >
          <Icon name={icon} size={20} color={iconColor} className="md:w-6 md:h-6 lg:w-7 lg:h-7" />
        </div>
      </div>
      {canShowAction ? (
        <button
          type="button"
          className="mb-2 text-xs font-medium text-primary hover:underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
      {trend && (
        <div className="flex items-center gap-1 md:gap-2">
          <Icon
            name={trend === 'up' ? 'TrendingUp' : 'TrendingDown'}
            size={14}
            color={trend === 'up' ? 'var(--color-success)' : 'var(--color-error)'}
            className="md:w-4 md:h-4"
          />
          <span
            className={`text-xs md:text-sm font-medium ${
              trend === 'up' ? 'text-success' : 'text-error'
            }`}
          >
            {trendValue}
          </span>
          <span className="text-xs md:text-sm text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
};

export default SummaryCard;
