import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import MetricsCard from '../admin-dashboard/components/MetricsCard';
import RevenueChart from '../admin-dashboard/components/RevenueChart';
import PerformanceMetrics from '../admin-dashboard/components/PerformanceMetrics';
import { formatRs } from '../../utils/format';
import { buildApiUrl } from '../../utils/api';

const buildMetrics = (data = {}) => ([
  {
    title: 'Total Revenue',
    value: formatRs(data?.totalRevenue || 0),
    change: '+0%',
    changeType: 'positive',
    icon: 'NepalRupee',
    iconColor: 'var(--color-success)',
    trend: formatRs(data?.totalRevenue || 0)
  },
  {
    title: 'Active Deliveries',
    value: String(data?.activeDeliveries || 0),
    change: '+0%',
    changeType: 'positive',
    icon: 'Truck',
    iconColor: 'var(--color-primary)',
    trend: `${data?.activeDeliveries || 0} today`
  },
  {
    title: 'Total Users',
    value: String(data?.totalUsers || 0),
    change: '+0%',
    changeType: 'positive',
    icon: 'Users',
    iconColor: 'var(--color-accent)',
    trend: 'Updated'
  },
  {
    title: 'Avg Response Time',
    value: `${Math.round(data?.avgResponseMinutes || 0)} min`,
    change: '+0%',
    changeType: 'positive',
    icon: 'Clock',
    iconColor: 'var(--color-warning)',
    trend: 'Updated'
  }
]);

const AdminAnalytics = () => {
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'Admin');
  const [metricsData, setMetricsData] = useState(buildMetrics());
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    window.scrollTo(0, 0);

    const loadAnalytics = async () => {
      try {
        if (userId) {
          const userRes = await fetch(buildApiUrl(`/api/users/${userId}`));
          if (userRes.ok) {
            const user = await userRes.json();
            setUserName(user?.fullName || 'Admin');
          }
        }

        const metricsRes = await fetch(buildApiUrl('/api/dashboard/admin'));
        if (metricsRes.ok) {
          const metrics = await metricsRes.json();
          setMetricsData(buildMetrics(metrics?.metrics || {}));
        }
      } catch (error) {
        setMetricsData((prev) => prev);
      }
    };

    loadAnalytics();
  }, [userId]);

  return (
    <>
      <Helmet>
        <title>Admin Analytics - CourierFlow</title>
        <meta
          name="description"
          content="Analytics view for CourierFlow admins with revenue trends and operational performance metrics"
        />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation userRole="admin" userName={userName} />

        <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-24">
          <div className="max-w-[1600px] mx-auto">
            <div className="py-6 md:py-8">
              <div className="mb-6 md:mb-8">
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                  Admin Analytics
                </h1>
                <p className="text-sm md:text-base text-muted-foreground">
                  Revenue and operational insights. Last updated:{' '}
                  {new Date()?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                {metricsData?.map((metric, index) => (
                  <MetricsCard key={index} {...metric} />
                ))}
              </div>

              <div className="mb-6 md:mb-8">
                <RevenueChart />
              </div>

              <div>
                <PerformanceMetrics />
              </div>
            </div>
          </div>
        </main>

        <QuickActionPanel userRole="admin" />
      </div>
    </>
  );
};

export default AdminAnalytics;
