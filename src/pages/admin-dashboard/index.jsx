import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';

import QuickActionPanel from '../../components/ui/QuickActionPanel';
import MetricsCard from './components/MetricsCard';
import RevenueChart from './components/RevenueChart';
import ActiveDeliveriesPanel from './components/ActiveDeliveriesPanel';
import CourierLocationPanel from './components/CourierLocationPanel';
import UserManagementTable from './components/UserManagementTable';
import SystemAlertsPanel from './components/SystemAlertsPanel';
import PerformanceMetrics from './components/PerformanceMetrics';
import RecentActivityFeed from './components/RecentActivityFeed';
import VehicleAssignmentPanel from './components/VehicleAssignmentPanel';
import BranchManagementPanel from './components/BranchManagementPanel';
import OrderManagementPanel from './components/OrderManagementPanel';
import SupportTicketsPanel from './components/SupportTicketsPanel';
import ChatModal from '../../components/ui/ChatModal';
import { formatRs } from '../../utils/format';
import { buildApiUrl } from '../../utils/api';
import { addInAppNotification, buildNotificationContext } from '../../utils/notifications';

const ADMIN_ALERT_POLL_MS = 30000;
const ADMIN_ALERT_INITIAL_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const ADMIN_ALERT_MAX_PER_POLL = 2;

const toTimestamp = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveAdminAlertIcon = (alert) => {
  const haystack = `${alert?.category || ''} ${alert?.name || ''}`.toLowerCase();
  if (haystack.includes('database') || haystack.includes('db')) {
    return 'Database';
  }
  if (haystack.includes('payment') || haystack.includes('billing') || haystack.includes('khalti')) {
    return 'CreditCard';
  }
  if (haystack.includes('shipment') || haystack.includes('booking')) {
    return 'PackageX';
  }
  if (haystack.includes('network') || haystack.includes('api') || haystack.includes('latency')) {
    return 'WifiOff';
  }
  return 'ShieldAlert';
};

const AdminDashboard = () => {
  const [metricsData, setMetricsData] = useState([
    {
      title: "Total Revenue",
      value: "RS 0",
      change: "+0%",
      changeType: "positive",
      icon: "NepalRupee",
      iconColor: "var(--color-success)",
      trend: "RS 0"
    },
    {
      title: "Active Deliveries",
      value: "0",
      change: "+0%",
      changeType: "positive",
      icon: "Truck",
      iconColor: "var(--color-primary)",
      trend: "0 today"
    },
    {
      title: "Total Users",
      value: "0",
      change: "+0%",
      changeType: "positive",
      icon: "Users",
      iconColor: "var(--color-accent)",
      trend: "0 new"
    },
    {
      title: "Avg Response Time",
      value: "0 min",
      change: "+0%",
      changeType: "positive",
      icon: "Clock",
      iconColor: "var(--color-warning)",
      trend: "Stable"
    }
  ]);
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'Admin');
  const userId = localStorage.getItem('userId');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState(null);
  const location = useLocation();
  const notificationContext = useMemo(
    () => buildNotificationContext({ userRole: 'admin', userId }),
    [userId]
  );
  const seenOpenAlertIdsRef = useRef(new Set());

  useEffect(() => {
    window.scrollTo(0, 0);

    const loadAdmin = async () => {
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
          const data = metrics?.metrics || {};
          setMetricsData([
            {
              title: "Total Revenue",
              value: formatRs(data?.totalRevenue || 0),
              change: "+0%",
              changeType: "positive",
              icon: "NepalRupee",
              iconColor: "var(--color-success)",
              trend: formatRs(data?.totalRevenue || 0)
            },
            {
              title: "Active Deliveries",
              value: String(data?.activeDeliveries || 0),
              change: "+0%",
              changeType: "positive",
              icon: "Truck",
              iconColor: "var(--color-primary)",
              trend: `${data?.activeDeliveries || 0} today`
            },
            {
              title: "Total Users",
              value: String(data?.totalUsers || 0),
              change: "+0%",
              changeType: "positive",
              icon: "Users",
              iconColor: "var(--color-accent)",
              trend: "Updated"
            },
            {
              title: "Avg Response Time",
              value: `${Math.round(data?.avgResponseMinutes || 0)} min`,
              change: "+0%",
              changeType: "positive",
              icon: "Clock",
              iconColor: "var(--color-warning)",
              trend: "Updated"
            }
          ]);
        }
      } catch (error) {
        setMetricsData((prev) => prev);
      }
    };

    loadAdmin();
  }, [userId]);

  useEffect(() => {
    if (!location?.hash) {
      return;
    }
    const targetId = location.hash.replace('#', '');
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location?.hash]);

  const handleOpenAdminChat = (payload) => {
    const bookingId = Number(payload?.bookingId);
    const recipientId = Number(payload?.recipientId);
    const recipientRole = String(payload?.recipientRole || '').trim().toLowerCase();
    if (!Number.isFinite(bookingId) || bookingId <= 0) {
      return;
    }
    if (!Number.isFinite(recipientId) || recipientId <= 0) {
      return;
    }
    if (!['customer', 'courier'].includes(recipientRole)) {
      return;
    }
    setChatContext({
      bookingId,
      bookingCode: String(payload?.bookingCode || '').trim(),
      recipientId,
      recipientRole,
      recipientLabel: String(payload?.recipientLabel || '').trim()
    });
    setIsChatOpen(true);
  };

  const handleCloseAdminChat = () => {
    setIsChatOpen(false);
    setChatContext(null);
  };

  useEffect(() => {
    let isMounted = true;
    seenOpenAlertIdsRef.current = new Set();

    const pollOpenAlerts = async (isInitialLoad = false) => {
      try {
        const res = await fetch(buildApiUrl('/api/admin/system-alerts?status=open&includeDemo=false'));
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!isMounted) {
          return;
        }

        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        const previousOpenIds = seenOpenAlertIdsRef.current;
        const now = Date.now();
        const newCandidates = alerts
          .filter((alert) => Number.isFinite(Number(alert?.id)))
          .filter((alert) => {
            const alertId = Number(alert.id);
            if (!isInitialLoad) {
              return !previousOpenIds.has(alertId);
            }
            const createdAtTs = toTimestamp(alert?.createdAt);
            if (createdAtTs === null) {
              return false;
            }
            return (now - createdAtTs) <= ADMIN_ALERT_INITIAL_LOOKBACK_MS;
          })
          .sort((a, b) => (toTimestamp(b?.createdAt) || 0) - (toTimestamp(a?.createdAt) || 0))
          .slice(0, ADMIN_ALERT_MAX_PER_POLL);

        newCandidates.forEach((alert) => {
          const title = String(alert?.name || '').trim();
          const message = String(alert?.action || alert?.trigger || '').trim();
          if (!title || !message) {
            return;
          }
          const status = String(alert?.status || 'open').trim().toLowerCase() || 'open';
          addInAppNotification(notificationContext, {
            type: 'alert',
            title,
            message,
            icon: resolveAdminAlertIcon(alert),
            link: '/admin-dashboard#admin-reports',
            dedupeKey: `__admin_system_alert_${alert?.id}_${status}`
          });
        });

        seenOpenAlertIdsRef.current = new Set(
          alerts
            .map((alert) => Number(alert?.id))
            .filter((id) => Number.isFinite(id))
        );
      } catch (error) {
        // Keep dashboard responsive when alerts API is temporarily unavailable.
      }
    };

    pollOpenAlerts(true);
    const pollId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        pollOpenAlerts(false);
      }
    }, ADMIN_ALERT_POLL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(pollId);
    };
  }, [notificationContext, userId]);


  return (
    <>
      <Helmet>
        <title>Admin Dashboard - CourierFlow</title>
        <meta name="description" content="Comprehensive admin dashboard for CourierFlow platform management with analytics, user management, and system monitoring" />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation 
          userRole="admin" 
          userName={userName} 
        />

        <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-24">
          <div className="max-w-[1600px] mx-auto">
            <div className="py-6 md:py-8">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 md:mb-8">
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                    Admin Dashboard
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Monitor and manage platform operations - Last updated: {new Date()?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
                {metricsData?.map((metric, index) => (
                  <MetricsCard key={index} {...metric} />
                ))}
              </div>

              <div id="admin-reports" className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                <div className="lg:col-span-2">
                  <RevenueChart />
                </div>
                <div className="lg:col-span-1">
                  <SystemAlertsPanel />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                <ActiveDeliveriesPanel onOpenChat={handleOpenAdminChat} />
                <CourierLocationPanel />
              </div>

              <div className="mb-6 md:mb-8">
                <RecentActivityFeed />
              </div>

              <div className="mb-6 md:mb-8">
                <PerformanceMetrics />
              </div>

              <div id="admin-vehicles" className="mb-6 md:mb-8">
                <VehicleAssignmentPanel />
              </div>

              <div id="admin-branches" className="mb-6 md:mb-8">
                <BranchManagementPanel />
              </div>

              <div id="admin-orders" className="mb-6 md:mb-8">
                <OrderManagementPanel onOpenChat={handleOpenAdminChat} />
              </div>

              <div id="admin-support" className="mb-6 md:mb-8">
                <SupportTicketsPanel />
              </div>

              <div id="admin-users">
                <UserManagementTable />
              </div>
            </div>
          </div>
        </main>

        <QuickActionPanel userRole="admin" />

        <ChatModal
          isOpen={isChatOpen}
          onClose={handleCloseAdminChat}
          bookingId={chatContext?.bookingId}
          title={chatContext?.bookingCode ? `Booking ${chatContext.bookingCode}` : 'Admin Chat'}
          currentUserId={userId}
          currentUserRole="admin"
          recipientId={chatContext?.recipientId}
          recipientRole={chatContext?.recipientRole}
          legLabel={chatContext?.recipientRole
            ? `Admin to ${chatContext.recipientRole}: ${chatContext?.recipientLabel || 'Recipient'}`
            : ''}
          canSend={Boolean(chatContext?.recipientId && chatContext?.recipientRole)}
          disabledReason="Select a valid chat recipient."
        />
      </div>
    </>
  );
};

export default AdminDashboard;


