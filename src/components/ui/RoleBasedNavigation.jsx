import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../AppIcon';
import NotificationCenter from './NotificationCenter';
import { clearClientAuthState } from '../../utils/auth';


const RoleBasedNavigation = ({ userRole = 'customer', userName = 'User', courierRole = null }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const courierLabel = courierRole === 'pickup'
    ? 'Pickups'
    : courierRole === 'linehaul'
      ? 'Linehauls'
      : 'Deliveries';

  const navigationItems = {
    customer: [
      { label: 'Dashboard', path: '/user-dashboard', icon: 'LayoutDashboard' },
      { label: 'Create Booking', path: '/create-booking', icon: 'PackagePlus' },
      { label: 'Track Order', path: '/order-tracking', icon: 'MapPin' },
    ],
    courier: [
      { label: 'Dashboard', path: '/courier-dashboard', icon: 'LayoutDashboard' },
      { label: `My ${courierLabel}`, path: '/courier-dashboard', hash: '#deliveries', icon: 'Truck' },
      { label: 'Earnings', path: '/courier-dashboard', hash: '#earnings', icon: 'NepalRupee' },
      { label: 'Route', path: '/courier-dashboard', hash: '#route', icon: 'Navigation' },
      { label: 'Navigation', path: '/courier-navigation', icon: 'Map' },
    ],
    admin: [
      { label: 'Dashboard', path: '/admin-dashboard', icon: 'LayoutDashboard' },
      { label: 'Orders', path: '/order-management', icon: 'ClipboardList' },
      { label: 'Users', path: '/admin-users', icon: 'Users' },
      { label: 'Analytics', path: '/admin-analytics', icon: 'BarChart3' },
      { label: 'Support', path: '/admin-support', icon: 'Headset' },
      { label: 'Settings', path: '/admin-settings', icon: 'Settings' },
    ],
  };

  const currentNavItems = navigationItems?.[userRole] || navigationItems?.customer;

  const itemKey = (item) => `${item?.path || ''}${item?.hash || ''}`;

  const isActive = (item) => {
    if (!item || location?.pathname !== item?.path) {
      return false;
    }
    if (item?.hash) {
      return location?.hash === item?.hash;
    }
    const hasHashVariant = currentNavItems?.some(
      (candidate) => candidate?.path === item?.path && Boolean(candidate?.hash)
    );
    if (hasHashVariant && location?.hash) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    clearClientAuthState();
    setIsMobileMenuOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="role-nav-header">
        <div className="role-nav-logo">
          <div className="role-nav-logo-icon">
            <Icon name="Package" size={24} color="var(--color-primary)" />
          </div>
          <span className="role-nav-logo-text hidden sm:block">CourierFlow</span>
        </div>

        <nav className="role-nav-menu">
          {currentNavItems?.map((item) => (
            <Link
              key={itemKey(item)}
              to={item?.hash ? { pathname: item.path, hash: item.hash } : item?.path}
              className={`role-nav-item ${isActive(item) ? 'active' : ''}`}
            >
              <Icon name={item?.icon} size={18} />
              <span>{item?.label}</span>
            </Link>
          ))}
        </nav>

        <div className="role-nav-actions">
          <NotificationCenter userRole={userRole} />

          <Link
            to="/profile"
            className="hidden lg:flex items-center gap-2 pl-3 border-l border-border hover:text-foreground"
            aria-label="Profile"
          >
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <Icon name="User" size={16} color="var(--color-primary)" />
            </div>
            <span className="text-sm font-medium text-foreground">{userName}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="hidden lg:flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-smooth"
            aria-label="Logout"
          >
            <Icon name="LogOut" size={16} />
            <span>Logout</span>
          </button>
        </div>

        <button
          className="role-nav-mobile-toggle"
          onClick={handleMobileMenuToggle}
          aria-label="Toggle mobile menu"
        >
          <Icon name={isMobileMenuOpen ? 'X' : 'Menu'} size={24} />
        </button>
      </header>
      {isMobileMenuOpen && (
        <div className="role-nav-mobile-menu">
          <div className="role-nav-mobile-header">
            <div className="role-nav-logo">
              <div className="role-nav-logo-icon">
                <Icon name="Package" size={24} color="var(--color-primary)" />
              </div>
              <span className="role-nav-logo-text">CourierFlow</span>
            </div>
            <button onClick={handleMobileMenuToggle} aria-label="Close menu">
              <Icon name="X" size={24} />
            </button>
          </div>

          <div className="role-nav-mobile-items">
            <div className="flex items-center gap-3 px-4 py-4 mb-4 bg-muted rounded-lg">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Icon name="User" size={20} color="var(--color-primary)" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{userName}</p>
                <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
              </div>
            </div>

            <Link
              to="/profile"
              className={`role-nav-mobile-item ${isActive({ path: '/profile' }) ? 'active' : ''}`}
              onClick={handleNavClick}
            >
              <Icon name="User" size={20} />
              <span>Profile</span>
            </Link>

            {currentNavItems?.map((item) => (
              <Link
                key={itemKey(item)}
                to={item?.hash ? { pathname: item.path, hash: item.hash } : item?.path}
                className={`role-nav-mobile-item ${isActive(item) ? 'active' : ''}`}
                onClick={handleNavClick}
              >
                <Icon name={item?.icon} size={20} />
                <span>{item?.label}</span>
              </Link>
            ))}

            <div className="mt-6 pt-6 border-t border-border">
              <button className="role-nav-mobile-item w-full text-left">
                <Icon name="Settings" size={20} />
                <span>Settings</span>
              </button>
              <button className="role-nav-mobile-item w-full text-left text-error" onClick={handleLogout}>
                <Icon name="LogOut" size={20} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoleBasedNavigation;


