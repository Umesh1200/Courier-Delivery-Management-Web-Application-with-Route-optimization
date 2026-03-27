const NOTIFICATIONS_UPDATED_EVENT = 'courierflow:notifications-updated';
const MAX_NOTIFICATIONS = 50;

const normalizeRole = (role) => {
  const value = String(role || 'customer').trim().toLowerCase();
  return value || 'customer';
};

const normalizeUserId = (userId) => {
  const value = String(userId || '').trim();
  if (!value || value === 'null' || value === 'undefined') {
    return 'guest';
  }
  return value;
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
  const createdAt = Number(notification.createdAt);
  return {
    id: String(notification.id || ''),
    type: String(notification.type || 'info'),
    title: String(notification.title || '').trim(),
    message: String(notification.message || '').trim(),
    icon: String(notification.icon || 'Bell'),
    link: notification.link ? String(notification.link) : null,
    read: Boolean(notification.read),
    dedupeKey: notification.dedupeKey ? String(notification.dedupeKey) : null,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
  };
};

const writeNotifications = (context, notifications) => {
  if (typeof window === 'undefined') {
    return;
  }
  const key = getNotificationStorageKey(context);
  const sanitized = (Array.isArray(notifications) ? notifications : [])
    .map((item) => sanitizeNotification(item))
    .filter((item) => Boolean(item?.id) && Boolean(item?.title) && Boolean(item?.message))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_NOTIFICATIONS);
  window.localStorage.setItem(key, JSON.stringify(sanitized));
  dispatchNotificationsUpdated();
};

export const readNotifications = (context) => {
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
    return (Array.isArray(parsed) ? parsed : [])
      .map((item) => sanitizeNotification(item))
      .filter((item) => Boolean(item?.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    return [];
  }
};

export const addInAppNotification = (context, notification) => {
  const title = String(notification?.title || '').trim();
  const message = String(notification?.message || '').trim();
  if (!title || !message) {
    return null;
  }

  const existing = readNotifications(context);
  const dedupeKey = notification?.dedupeKey ? String(notification.dedupeKey) : null;
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

  writeNotifications(context, [nextNotification, ...existing]);
  return nextNotification;
};

export const markNotificationRead = (context, notificationId) => {
  const targetId = String(notificationId || '').trim();
  if (!targetId) {
    return;
  }
  const existing = readNotifications(context);
  let changed = false;
  const next = existing.map((item) => {
    if (item.id !== targetId || item.read) {
      return item;
    }
    changed = true;
    return { ...item, read: true };
  });
  if (changed) {
    writeNotifications(context, next);
  }
};

export const markAllNotificationsRead = (context) => {
  const existing = readNotifications(context);
  if (!existing.some((item) => !item.read)) {
    return;
  }
  const next = existing.map((item) => ({ ...item, read: true }));
  writeNotifications(context, next);
};

export const clearNotifications = (context) => {
  writeNotifications(context, []);
};

export const formatNotificationTime = (createdAt) => {
  const value = Number(createdAt);
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
