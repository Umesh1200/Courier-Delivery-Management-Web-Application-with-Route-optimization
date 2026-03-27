import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../AppIcon';

const QuickActionPanel = ({ userRole = 'customer' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const quickActions = {
    customer: [
      {
        label: 'New Booking',
        icon: 'PackagePlus',
        action: () => navigate('/create-booking'),
        color: 'var(--color-primary)',
      },
      {
        label: 'Track Order',
        icon: 'MapPin',
        action: () => navigate('/order-tracking'),
        color: 'var(--color-accent)',
      },
      {
        label: 'Dashboard',
        icon: 'History',
        action: () => navigate('/user-dashboard'),
        color: 'var(--color-secondary)',
      },
    ],
    courier: [
      {
        label: 'Route Planner',
        icon: 'Navigation',
        action: () => navigate('/courier-dashboard#route'),
        color: 'var(--color-success)',
      },
      {
        label: 'My Deliveries',
        icon: 'Truck',
        action: () => navigate('/courier-dashboard'),
        color: 'var(--color-primary)',
      },
      {
        label: 'Live Navigation',
        icon: 'Compass',
        action: () => navigate('/courier-navigation'),
        color: 'var(--color-accent)',
      },
    ],
    admin: [
      {
        label: 'Add User',
        icon: 'UserPlus',
        action: () => navigate('/admin-users'),
        color: 'var(--color-primary)',
      },
      {
        label: 'View Reports',
        icon: 'FileText',
        action: () => navigate('/admin-analytics'),
        color: 'var(--color-accent)',
      },
      {
        label: 'Settings',
        icon: 'Settings',
        action: () => navigate('/admin-settings'),
        color: 'var(--color-secondary)',
      },
    ],
  };

  const currentActions = quickActions?.[userRole] || quickActions?.customer;

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleActionClick = (action) => {
    action();
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event?.target?.closest('.quick-action-panel')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="quick-action-panel">
      {isOpen && (
        <div className="quick-action-menu">
          {currentActions?.map((action, index) => (
            <button
              key={index}
              className="quick-action-item"
              onClick={() => handleActionClick(action?.action)}
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${action?.color}15` }}
              >
                <Icon name={action?.icon} size={20} color={action?.color} />
              </div>
              <span className="text-sm font-medium text-foreground">{action?.label}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="quick-action-fab"
        onClick={handleToggle}
        aria-label="Quick actions"
      >
        <Icon name={isOpen ? 'X' : 'Plus'} size={24} />
      </button>
    </div>
  );
};

export default QuickActionPanel;

