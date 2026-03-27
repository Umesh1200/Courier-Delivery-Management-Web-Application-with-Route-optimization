import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import SupportTicketsPanel from '../admin-dashboard/components/SupportTicketsPanel';
import { buildApiUrl } from '../../utils/api';

const AdminSupport = () => {
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'Admin');
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    window.scrollTo(0, 0);

    const loadAdmin = async () => {
      try {
        if (!userId) {
          return;
        }
        const userRes = await fetch(buildApiUrl(`/api/users/${userId}`));
        if (!userRes.ok) {
          return;
        }
        const user = await userRes.json();
        setUserName(user?.fullName || 'Admin');
      } catch (error) {
        setUserName((prev) => prev);
      }
    };

    loadAdmin();
  }, [userId]);

  return (
    <>
      <Helmet>
        <title>Admin Support - CourierFlow</title>
        <meta
          name="description"
          content="Admin support center for managing support tickets and replying to customer conversations"
        />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation userRole="admin" userName={userName} />

        <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-24">
          <div className="max-w-[1600px] mx-auto py-6 md:py-8">
            <div className="mb-6 md:mb-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                Admin Support
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Review customer tickets and respond through live support chat.
              </p>
            </div>

            <SupportTicketsPanel />
          </div>
        </main>

        <QuickActionPanel userRole="admin" />
      </div>
    </>
  );
};

export default AdminSupport;
