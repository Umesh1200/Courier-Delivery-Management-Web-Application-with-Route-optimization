import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/landing-page";
import CreateBooking from "./pages/create-booking";
import CheckoutPage from "./pages/checkout-page";
import OrderTracking from "./pages/order-tracking";
import UserDashboard from "./pages/user-dashboard";
import UserInvoices from "./pages/user-invoices";
import CourierDashboard from "./pages/courier-dashboard";
import CourierNavigation from "./pages/courier-navigation";
import AdminDashboard from "./pages/admin-dashboard";
import AdminAnalytics from "./pages/admin-analytics";
import AdminUsers from "./pages/admin-users";
import AdminSettings from "./pages/admin-settings";
import AdminSupport from "./pages/admin-support";
import OrderManagementPage from "./pages/order-management";
import ProfilePage from "./pages/profile";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import AuthenticationGate from "./components/ui/AuthenticationGate";

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/landing-page" replace />} />
    <Route path="/landing-page" element={<LandingPage />} />
    <Route
      path="/create-booking"
      element={(
        <AuthenticationGate requiredRole="customer">
          <CreateBooking />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/checkout-page"
      element={(
        <AuthenticationGate requiredRole="customer">
          <CheckoutPage />
        </AuthenticationGate>
      )}
    />
    <Route path="/order-tracking" element={<OrderTracking />} />
    <Route
      path="/user-dashboard"
      element={(
        <AuthenticationGate requiredRole="customer">
          <UserDashboard />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/user-invoices"
      element={(
        <AuthenticationGate requiredRole="customer">
          <UserInvoices />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/courier-dashboard"
      element={(
        <AuthenticationGate requiredRole="courier">
          <CourierDashboard />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/courier-navigation"
      element={(
        <AuthenticationGate requiredRole="courier">
          <CourierNavigation />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/admin-dashboard"
      element={(
        <AuthenticationGate requiredRole="admin">
          <AdminDashboard />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/admin-analytics"
      element={(
        <AuthenticationGate requiredRole="admin">
          <AdminAnalytics />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/admin-users"
      element={(
        <AuthenticationGate requiredRole="admin">
          <AdminUsers />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/admin-settings"
      element={(
        <AuthenticationGate requiredRole="admin">
          <AdminSettings />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/admin-support"
      element={(
        <AuthenticationGate requiredRole="admin">
          <AdminSupport />
        </AuthenticationGate>
      )}
    />
    <Route
      path="/order-management"
      element={(
        <AuthenticationGate requiredRole="admin">
          <OrderManagementPage />
        </AuthenticationGate>
      )}
    />
    <Route path="/order-mangement" element={<Navigate to="/order-management" replace />} />
    <Route
      path="/profile"
      element={(
        <AuthenticationGate>
          <ProfilePage />
        </AuthenticationGate>
      )}
    />
    <Route path="/login" element={<Login />} />
    <Route path="/signup" element={<Signup />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default AppRoutes;
