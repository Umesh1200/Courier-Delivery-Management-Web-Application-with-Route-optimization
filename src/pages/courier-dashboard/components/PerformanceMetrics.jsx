import React from 'react';
import Icon from '../../../components/AppIcon';

const PerformanceMetrics = ({ metrics }) => {
  const getScoreColor = (score) => {
    if (score >= 90) return 'text-success';
    if (score >= 70) return 'text-warning';
    return 'text-error';
  };

  const getScoreBgColor = (score) => {
    if (score >= 90) return 'bg-success/10';
    if (score >= 70) return 'bg-warning/10';
    return 'bg-error/10';
  };

  return (
    <div className="bg-card rounded-xl shadow-elevation-md p-4 md:p-6 border border-border">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Icon name="TrendingUp" size={20} color="var(--color-primary)" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-foreground">Performance Metrics</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Your delivery statistics</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={`rounded-xl p-4 md:p-6 ${getScoreBgColor(metrics?.overallScore)}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Overall Score</p>
            <Icon name="Award" size={18} className={getScoreColor(metrics?.overallScore)} />
          </div>
          <h3 className={`text-3xl md:text-4xl font-bold ${getScoreColor(metrics?.overallScore)} mb-2`}>
            {metrics?.overallScore}%
          </h3>
          <p className="text-xs text-muted-foreground">
            {metrics?.overallScore >= 90 ? 'Excellent performance!' : metrics?.overallScore >= 70 ? 'Good performance' : 'Needs improvement'}
          </p>
        </div>

        <div className="bg-muted rounded-xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Customer Rating</p>
            <Icon name="Star" size={18} className="text-warning" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-3xl md:text-4xl font-bold text-foreground">{metrics?.customerRating?.toFixed(1)}</h3>
            <span className="text-sm text-muted-foreground">/ 5.0</span>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5]?.map((star) => (
              <Icon
                key={star}
                name={star <= Math.floor(metrics?.customerRating) ? 'Star' : 'StarHalf'}
                size={14}
                className="text-warning"
              />
            ))}
            <span className="text-xs text-muted-foreground ml-2">({metrics?.totalReviews} reviews)</span>
          </div>
        </div>
      </div>
      <div className="space-y-4 mb-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon name="CheckCircle2" size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Completion Rate</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{metrics?.completionRate}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-success h-2 rounded-full transition-smooth"
              style={{ width: `${metrics?.completionRate}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon name="Clock" size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">On-Time Delivery</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{metrics?.onTimeRate}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-smooth"
              style={{ width: `${metrics?.onTimeRate}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Icon name="Zap" size={16} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Efficiency Score</span>
            </div>
            <span className="text-sm font-semibold text-foreground">{metrics?.efficiencyScore}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-smooth"
              style={{ width: `${metrics?.efficiencyScore}%` }}
            />
          </div>
        </div>
      </div>
      <div className="bg-muted rounded-lg p-4 mb-6">
        <h4 className="text-sm font-semibold text-foreground mb-3">Recent Achievements</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics?.achievements?.map((achievement, index) => (
            <div key={index} className="text-center">
              <div className={`w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center ${
                achievement?.unlocked ? 'bg-primary/10' : 'bg-background'
              }`}>
                <Icon
                  name={achievement?.icon}
                  size={20}
                  color={achievement?.unlocked ? 'var(--color-primary)' : 'var(--color-muted-foreground)'}
                />
              </div>
              <p className={`text-xs font-medium ${achievement?.unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                {achievement?.name}
              </p>
            </div>
          ))}
        </div>
      </div>
      {metrics?.suggestions && metrics?.suggestions?.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="Lightbulb" size={16} color="var(--color-primary)" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground mb-2">Improvement Suggestions</h4>
              <ul className="space-y-1">
                {metrics?.suggestions?.map((suggestion, index) => (
                  <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                    <Icon name="ChevronRight" size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformanceMetrics;