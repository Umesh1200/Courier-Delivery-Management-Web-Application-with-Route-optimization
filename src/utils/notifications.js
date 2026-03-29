import { buildApiUrl } from './api';

const NOTIFICATIONS_UPDATED_EVENT = 'courierflow:notifications-updated';
const MAX_NOTIFICATIONS = 50;

const normalizeRole = (role) => {
  const value = String(role || 'customer').trim().toLowerCase();
  if (['customer', 'courier', 'admin'].includes(value)) {
    return value;
  }
  return 'customer';
};

const normalizeUserId = (userId) => {
  const value = String(userId || '').trim();
  if (!value || value === 'null' || value === 'undefined') {
    return 'guest';
  }
  return value;
};

const getNumericUserId = (context) => {
  const value = Number.parseInt(String(context?.userId || '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const canUseRemoteNotifications = (context) => getNumericUserId(context) > 0;

const toTimestamp = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Date.now();
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  return Date.now();
};

export const buildNotificationContext = ({ userRole = 'customer', userId }) => ({
  userRole: normalizeRole(userRole),
  userId: normalizeUserId(userId)
});

export const getNotificationStorageKey = (context) => (
  `__cf_notifications_${context.userRole}_${context.userId}`
);

const dispatchNotificationsUpdated = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_UPDATED_EVENT));
};

const sanitizeNotification = (notification) => {
  if (!notification || typeof notification !== 'object') {
    return null;
  }

  return {
    id: String(notification.id || ''),
    type: String(notification.type || 'info'),
    title: String(notification.title || '').trim(),
    message: String(notification.message || notification.body || '').trim(),
    icon: String(notification.icon || 'Bell'),
    link: notification.link ? String(notification.link) : null,
    read: Boolean(notification.read),
    dedupeKey: notification.dedupeKey ? String(notification.dedupeKey) : null,
    createdAt: toTimestamp(notification.createdAt ?? notification.created_at),
    readAt: notification.readAt || notification.read_at || null
  };
};

const normalizeNotificationList = (notifications = []) => (
  (Array.isArray(notifications) ? notifications : [])
    .map((item) => sanitizeNotification(item))
    .filter((item) => Boolean(item?.id) && Boolean(item?.title) && Boolean(item?.message))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_NOTIFICATIONS)
);

const writeLocalNotifications = (context, notifications) => {
  if (typeof window === 'undefined') {
    return;
  }
  const key = getNotificationStorageKey(context);
  const sanitized = normalizeNotificationList(notifications);
  window.localStorage.setItem(key, JSON.stringify(sanitized));
  dispatchNotificationsUpdated();
};

const readLocalNotifications = (context) => {
  if (typeof window === 'undefined') {
    return [];
  }
  const key = getNotificationStorageKey(context);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return normalizeNotificationList(parsed);
  } catch (error) {
    return [];
  }
};

const requestNotifications = async (path, options = {}) => {
  try {
    const response = await fetch(buildApiUrl(path), options);
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      payload: null
    };
  }
};

const buildRemoteQuery = (context, extra = {}) => {
  const userId = getNumericUserId(context);
  if (userId <= 0) {
    return '';
  }

  const params = new URLSearchParams({
    userId: String(userId)
  });
  const role = normalizeRole(context?.userRole);
  if (role) {
    params.set('role', role);
  }
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
};

const readRemoteNotifications = async (context) => {
  const query = buildRemoteQuery(context, { limit: MAX_NOTIFICATIONS });
  if (!query) {
    return [];
  }
  const { ok, payload } = await requestNotifications(`/api/notifications?${query}`);
  if (!ok) {
    return [];
  }
  return normalizeNotificationList(payload?.notifications);
};

export const readNotifications = async (context) => {
  if (!canUseRemoteNotifications(context)) {
    return readLocalNotifications(context);
  }
  return readRemoteNotifications(context);
};

export const addInAppNotification = async (context, notification) => {
  const title = String(notification?.title || '').trim();
  const message = String(notification?.message || '').trim();
  if (!title || !message) {
    return null;
  }

  const dedupeKey = notification?.dedupeKey ? String(notification.dedupeKey) : null;

  if (!canUseRemoteNotifications(context)) {
    const existing = readLocalNotifications(context);
    if (dedupeKey && existing.some((item) => item?.dedupeKey === dedupeKey)) {
      return null;
    }

    const createdAt = Date.now();
    const nextNotification = sanitizeNotification({
      id: notification?.id || `${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
      type: notification?.type || 'info',
      title,
      message,
      icon: notification?.icon || 'Bell',
      link: notification?.link || null,
      read: false,
      dedupeKey,
      createdAt
    });

    if (!nextNotification) {
      return null;
    }

    writeLocalNotifications(context, [nextNotification, ...existing]);
    return nextNotification;
  }

  const userId = getNumericUserId(context);
  const { ok, payload } = await requestNotifications('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      role: normalizeRole(context?.userRole),
      type: notification?.type || 'info',
      title,
      message,
      icon: notification?.icon || 'Bell',
      link: notification?.link || null,
      dedupeKey
    })
  });

  if (!ok) {
    return null;
  }

  const savedNotification = sanitizeNotification(payload?.notification);
  if (savedNotification) {
    dispatchNotificationsUpdated();
  }
  return savedNotification;
};

export const markNotificationRead = async (context, notificationId) => {
  const targetId = String(notificationId || '').trim();
  if (!targetId) {
    return null;
  }

  if (!canUseRemoteNotifications(context)) {
    const existing = readLocalNotifications(context);
    let changed = false;
    const next = existing.map((item) => {
      if (item.id !== targetId || item.read) {
        return item;
      }
      changed = true;
      return { ...item, read: true, readAt: Date.now() };
    });
    if (changed) {
      writeLocalNotifications(context, next);
    }
    return next.find((item) => item.id === targetId) || null;
  }

  const { ok, payload } = await requestNotifications(`/api/notifications/${encodeURIComponent(targetId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getNumericUserId(context),
      role: normalizeRole(context?.userRole),
      read: true
    })
  });

  if (!ok) {
    return null;
  }

  const updatedNotification = sanitizeNotification(payload?.notification);
  if (updatedNotification) {
    dispatchNotificationsUpdated();
  }
  return updatedNotification;
};

export const markAllNotificationsRead = async (context) => {
  if (!canUseRemoteNotifications(context)) {
    const existing = readLocalNotifications(context);
    if (!existing.some((item) => !item.read)) {
      return existing;
    }
    const next = existing.map((item) => ({ ...item, read: true, readAt: item.readAt || Date.now() }));
    writeLocalNotifications(context, next);
    return next;
  }

  const { ok, payload } = await requestNotifications('/api/notifications/read-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getNumericUserId(context),
      role: normalizeRole(context?.userRole)
    })
  });

  if (!ok) {
    return [];
  }

  dispatchNotificationsUpdated();
  return normalizeNotificationList(payload?.notifications);
};

export const clearNotifications = async (context) => {
  if (!canUseRemoteNotifications(context)) {
    writeLocalNotifications(context, []);
    return [];
  }

  const { ok } = await requestNotifications('/api/notifications/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getNumericUserId(context),
      role: normalizeRole(context?.userRole)
    })
  });

  if (!ok) {
    return null;
  }

  dispatchNotificationsUpdated();
  return [];
};

export const formatNotificationTime = (createdAt) => {
  const value = toTimestamp(createdAt);
  if (!Number.isFinite(value)) {
    return '';
  }

  const seconds = Math.floor((Date.now() - value) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} min ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)} hr ago`;
  }
  return `${Math.floor(seconds / 86400)} day ago`;
};

export { NOTIFICATIONS_UPDATED_EVENT };
