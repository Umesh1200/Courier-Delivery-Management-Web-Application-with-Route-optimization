import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../AppIcon';
import Button from './Button';
import {
  NOTIFICATIONS_UPDATED_EVENT,
  buildNotificationContext,
  clearNotifications,
  formatNotificationTime,
  getNotificationStorageKey,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications
} from '../../utils/notifications';

const NotificationCenter = ({ userRole = 'customer' }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const userId = typeof window !== 'undefined' ? window.localStorage.getItem('userId') : null;
  const notificationContext = useMemo(
    () => buildNotificationContext({ userRole, userId }),
    [userId, userRole]
  );
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification?.read).length,
    [notifications]
  );

  const refreshNotifications = useCallback(() => {
    setNotifications(readNotifications(notificationContext));
  }, [notificationContext]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    const storageKey = getNotificationStorageKey(notificationContext);
    const handleNotificationsUpdated = () => {
      refreshNotifications();
    };
    const handleStorage = (event) => {
      if (event?.key === storageKey) {
        refreshNotifications();
      }
    };

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [notificationContext, refreshNotifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isOpen && !event?.target?.closest('.notification-panel') && !event?.target?.closest('[aria-label="Notifications"]')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((previous) => !previous);
  };

  const handleMarkAsRead = (id) => {
    markNotificationRead(notificationContext, id);
    refreshNotifications();
  };

  const handleNotificationClick = (notification) => {
    handleMarkAsRead(notification?.id);
    const link = typeof notification?.link === 'string' ? notification.link.trim() : '';
    if (link) {
      navigate(link);
    }
  };

  const handleMarkAllAsRead = () => {
    markAllNotificationsRead(notificationContext);
    refreshNotifications();
  };

  const handleClearAll = () => {
    clearNotifications(notificationContext);
    refreshNotifications();
    setIsOpen(false);
  };

  return (
    <>
      <button
        className="relative p-2 hover:bg-muted rounded-lg transition-smooth"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <Icon name="Bell" size={20} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="notification-panel">
          <div className="notification-header">
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button onClick={handleToggle} aria-label="Close notifications">
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>

          <div className="notification-list">
            {notifications?.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Icon name="Bell" size={32} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification?.id}
                  className={`notification-item ${!notification?.read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon name={notification?.icon || 'Bell'} size={16} color="var(--color-primary)" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground mb-1">
                        {notification?.title}
                      </p>
                      <p className="text-xs text-muted-foreground mb-1">
                        {notification?.message}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatNotificationTime(notification?.createdAt)}</p>
                    </div>
                    {!notification?.read && (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2"></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications?.length > 0 && (
            <div className="px-4 py-3 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={handleClearAll}
                iconName="Trash2"
                iconPosition="left"
              >
                Clear All
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default NotificationCenter;
