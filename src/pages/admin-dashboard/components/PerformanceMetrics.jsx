import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Icon from '../../../components/AppIcon';
import { buildApiUrl } from '../../../utils/api';

const PerformanceMetrics = () => {
  const [courierPerformance, setCourierPerformance] = useState([]);
  const [satisfactionData, setSatisfactionData] = useState([]);
  const [summary, setSummary] = useState({
    avgRating: 0,
    onTimeRate: 0,
    successRate: 0,
    satisfaction: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMetrics = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/performance-metrics'));
      if (!res.ok) {
        throw new Error('Failed to load performance metrics');
      }
      const data = await res.json();
      setCourierPerformance(data?.topCouriers || []);
      setSatisfactionData(data?.satisfaction || []);
      setSummary({
        avgRating: data?.summary?.avgRating || 0,
        onTimeRate: data?.summary?.onTimeRate || 0,
        successRate: data?.summary?.successRate || 0,
        satisfaction: data?.summary?.satisfaction || 0
      });
    } catch (err) {
      setError('Unable to load performance metrics right now.');
      setCourierPerformance([]);
      setSatisfactionData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const getBarColor = (value) => {
    if (value >= 90) return 'var(--color-success)';
    if (value >= 80) return 'var(--color-primary)';
    if (value >= 70) return 'var(--color-warning)';
    return 'var(--color-error)';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload?.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-elevation-lg">
          <p className="text-sm font-medium text-foreground mb-1">{payload?.[0]?.payload?.category}</p>
          <p className="text-xs text-muted-foreground">Score: <span className="font-semibold text-foreground">{payload?.[0]?.value}%</span></p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-1">Performance Metrics</h3>
        <p className="text-sm text-muted-foreground">Courier and customer satisfaction analytics</p>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading performance metrics...
        </div>
      )}
      {!isLoading && courierPerformance?.length === 0 && !error && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No performance data available.
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-4">Top Performing Couriers</h4>
          <div className="space-y-3">
            {courierPerformance?.map((courier, index) => (
              <div key={index} className="bg-muted/30 rounded-lg p-3 hover:bg-muted/50 transition-smooth">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{courier?.name}</span>
                    <div className="flex items-center gap-1">
                      <Icon name="Star" size={12} color="var(--color-warning)" />
                      <span className="text-xs font-medium text-foreground">{courier?.rating}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {courier?.completed} {courier?.role === 'pickup'
                      ? 'pickups'
                      : courier?.role === 'linehaul'
                        ? 'linehauls'
                        : 'deliveries'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${courier?.onTime}%`,
                        backgroundColor: getBarColor(courier?.onTime)
                      }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">{courier?.onTime}% on-time</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-foreground mb-4">Customer Satisfaction</h4>
          <div className="w-full h-64" aria-label="Customer satisfaction bar chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={satisfactionData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis 
                  dataKey="category" 
                  stroke="var(--color-muted-foreground)" 
                  style={{ fontSize: '11px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="var(--color-muted-foreground)" 
                  style={{ fontSize: '11px' }}
                  domain={[0, 100]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                  {satisfactionData?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry?.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground mb-1">{summary?.avgRating?.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">Avg Rating</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground mb-1">{summary?.onTimeRate}%</p>
          <p className="text-xs text-muted-foreground">On-Time Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground mb-1">{summary?.successRate}%</p>
          <p className="text-xs text-muted-foreground">Success Rate</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-foreground mb-1">{summary?.satisfaction}%</p>
          <p className="text-xs text-muted-foreground">Satisfaction</p>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetrics;
