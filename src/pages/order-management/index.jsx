import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import RoleBasedNavigation from '../../components/ui/RoleBasedNavigation';
import QuickActionPanel from '../../components/ui/QuickActionPanel';
import ChatModal from '../../components/ui/ChatModal';
import OrderManagementPanel from '../admin-dashboard/components/OrderManagementPanel';
import { buildApiUrl } from '../../utils/api';

const OrderManagementPage = () => {
  const [userName, setUserName] = useState(localStorage.getItem('userName') || 'Admin');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState(null);
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

  return (
    <>
      <Helmet>
        <title>Order Management - CourierFlow</title>
        <meta
          name="description"
          content="Admin order management for CourierFlow including assignments, status updates, and incident handling"
        />
      </Helmet>
      <div className="min-h-screen bg-background">
        <RoleBasedNavigation userRole="admin" userName={userName} />

        <main className="pt-[60px] px-4 md:px-6 lg:px-8 pb-24">
          <div className="max-w-[1600px] mx-auto py-6 md:py-8">
            <div className="mb-6 md:mb-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground mb-2">
                Order Management
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">
                Manage order lifecycle, courier assignments, incidents, and admin actions.
              </p>
            </div>

            <OrderManagementPanel onOpenChat={handleOpenAdminChat} />
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

export default OrderManagementPage;
