import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const AuthenticationGate = ({ children, requiredRole = null }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const checkAuthentication = () => {
      const authToken = localStorage.getItem('authToken');
      const storedRole = localStorage.getItem('userRole');

      if (authToken && storedRole) {
        setIsAuthenticated(true);
        setUserRole(storedRole);
      } else {
        setIsAuthenticated(false);
        setUserRole(null);
      }
      setIsLoading(false);
    };

    checkAuthentication();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing-page" state={{ from: location }} replace />;
  }

  if (requiredRole && userRole !== requiredRole) {
    const defaultRoutes = {
      customer: '/user-dashboard',
      courier: '/courier-dashboard',
      admin: '/admin-dashboard',
    };
    return <Navigate to={defaultRoutes?.[userRole] || '/landing-page'} replace />;
  }

  return <>{children}</>;
};

export default AuthenticationGate;