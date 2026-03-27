import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import UserManagementTable from '../admin-dashboard/components/UserManagementTable';
import { buildApiUrl } from '../../utils/api';

const AdminUsers = () => {
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
        <title>Admin Users - CourierFlow</title>
        <meta
          name="description"
          content="User administration for CourierFlow with role, status, and account management tools"
        />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation userRole="admin" userName={userName} />

        <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-24">
          <div className="max-w-[1600px] mx-auto py-6 md:py-8">
            <div className="mb-6 md:mb-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                Admin Users
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Manage customers, couriers, and admin accounts.
              </p>
            </div>

            <UserManagementTable />
          </div>
        </main>

        <QuickActionPanel userRole="admin" />
      </div>
    </>
  );
};

export default AdminUsers;
