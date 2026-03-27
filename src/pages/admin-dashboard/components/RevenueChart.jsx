import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Icon from '../../../components/AppIcon';
import { formatRs } from '../../../utils/format';
import { buildApiUrl } from '../../../utils/api';

const RevenueChart = () => {
  const [revenueData, setRevenueData] = useState([]);
  const [summary, setSummary] = useState({
    avgMonthly: 0,
    bestMonth: '',
    growthPercent: 0,
    totalOrders: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRevenue = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(buildApiUrl('/api/admin/revenue-overview'));
      if (!res.ok) {
        throw new Error('Failed to load revenue overview');
      }
      const data = await res.json();
      setRevenueData(data?.data || []);
      setSummary({
        avgMonthly: data?.summary?.avgMonthly || 0,
        bestMonth: data?.summary?.bestMonth || '',
        growthPercent: data?.summary?.growthPercent || 0,
        totalOrders: data?.summary?.totalOrders || 0
      });
    } catch (err) {
      setError('Unable to load revenue overview right now.');
      setRevenueData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRevenue();
  }, []);

  const summaryStats = useMemo(() => ([
    { label: 'Avg Monthly', value: formatRs(summary?.avgMonthly) },
    { label: 'Best Month', value: summary?.bestMonth || 'N/A' },
    { label: 'Growth', value: `${summary?.growthPercent?.toFixed(1)}%` },
    { label: 'Orders', value: summary?.totalOrders?.toLocaleString?.() || '0' }
  ]), [summary]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload?.length) {
      const revenue = payload?.[0]?.value ?? 0;
      const orders = payload?.[1]?.value ?? 0;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-elevation-lg">
          <p className="text-sm font-medium text-foreground mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">
            Revenue: <span className="font-semibold text-foreground">RS {revenue?.toLocaleString()}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Orders: <span className="font-semibold text-foreground">{orders?.toLocaleString()}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-card rounded-xl p-4 md:p-6 shadow-elevation-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Revenue Overview</h3>
          <p className="text-sm text-muted-foreground">Monthly revenue and order volume</p>
        </div>
        <div className={`flex items-center gap-2 text-sm font-medium ${summary.growthPercent >= 0 ? 'text-success' : 'text-error'}`}>
          <Icon
            name={summary.growthPercent >= 0 ? 'TrendingUp' : 'TrendingDown'}
            size={16}
            color={summary.growthPercent >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
          />
          {summary.growthPercent >= 0 ? '+' : ''}
          {summary.growthPercent.toFixed(1)}% vs last period
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Loading revenue overview...
        </div>
      )}
      {!isLoading && revenueData?.length > 0 && (
        <div className="h-72 w-full" aria-label="Revenue area chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} />
              <YAxis stroke="var(--color-muted-foreground)" style={{ fontSize: '12px' }} tickFormatter={(value) => `RS ${value / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                fill="url(#revenueFill)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke="var(--color-accent)"
                fill="url(#ordersFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isLoading && revenueData?.length === 0 && !error && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No revenue data available.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
        {summaryStats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-xl font-semibold text-foreground mb-1">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RevenueChart;
