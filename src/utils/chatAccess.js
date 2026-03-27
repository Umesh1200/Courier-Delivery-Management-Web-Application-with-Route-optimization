const PICKUP_CHAT_STATUSES = new Set([
  'pickup_assigned',
  'picked_up',
  'in_transit_to_origin_branch'
]);

const DELIVERY_CHAT_STATUSES = new Set([
  'delivery_assigned',
  'delivery_load_confirmed',
  'out_for_delivery'
]);

export const CHAT_LEG_PICKUP = 'pickup_leg';
export const CHAT_LEG_DELIVERY = 'delivery_leg';
export const CHAT_LEG_GENERAL = 'general_leg';

export const normalizeCourierRole = (role) => {
  const normalized = String(role || '').trim().toLowerCase();
  return ['pickup', 'delivery', 'linehaul', 'both'].includes(normalized)
    ? normalized
    : 'both';
};

export const normalizeDeliveryStatus = (status) => (
  String(status || '').trim().toLowerCase()
);

export const getChatLegKeyForStatus = (status) => {
  const normalizedStatus = normalizeDeliveryStatus(status);
  if (PICKUP_CHAT_STATUSES.has(normalizedStatus)) {
    return CHAT_LEG_PICKUP;
  }
  if (DELIVERY_CHAT_STATUSES.has(normalizedStatus)) {
    return CHAT_LEG_DELIVERY;
  }
  return CHAT_LEG_GENERAL;
};

export const canCourierRoleAccessChat = (courierRole, status) => {
  const role = normalizeCourierRole(courierRole);
  const normalizedStatus = normalizeDeliveryStatus(status);

  if (role === 'linehaul') {
    return false;
  }
  if (role === 'pickup') {
    return PICKUP_CHAT_STATUSES.has(normalizedStatus);
  }
  if (role === 'delivery') {
    return DELIVERY_CHAT_STATUSES.has(normalizedStatus);
  }
  return PICKUP_CHAT_STATUSES.has(normalizedStatus) || DELIVERY_CHAT_STATUSES.has(normalizedStatus);
};

export const getCourierChatAccessMeta = (courierRole, status) => {
  const role = normalizeCourierRole(courierRole);
  const legKey = getChatLegKeyForStatus(status);
  const allowed = canCourierRoleAccessChat(role, status);
  if (allowed) {
    return {
      allowed: true,
      legKey,
      reason: ''
    };
  }
  if (role === 'linehaul') {
    return {
      allowed: false,
      legKey,
      reason: 'Linehaul couriers do not use customer chat.'
    };
  }
  if (role === 'pickup') {
    return {
      allowed: false,
      legKey,
      reason: 'Chat is only available during pickup stage.'
    };
  }
  if (role === 'delivery') {
    return {
      allowed: false,
      legKey,
      reason: 'Chat is only available during delivery stage.'
    };
  }
  return {
    allowed: false,
    legKey,
    reason: 'Chat unlocks only during pickup or delivery stages.'
  };
};

export const getChatLegLabel = (legKey) => {
  if (legKey === CHAT_LEG_PICKUP) {
    return 'Pickup Leg';
  }
  if (legKey === CHAT_LEG_DELIVERY) {
    return 'Delivery Leg';
  }
  return 'Active Leg';
};

export const buildChatSeenStorageKey = ({
  bookingId,
  userId,
  userRole = 'courier',
  legKey = CHAT_LEG_GENERAL
}) => `__chat_seen_${userRole}_${Number(userId) || 0}_${Number(bookingId) || 0}_${legKey}`;

export const readSeenMessageId = (params) => {
  if (typeof window === 'undefined') {
    return 0;
  }
  try {
    const key = buildChatSeenStorageKey(params);
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (error) {
    return 0;
  }
};

export const writeSeenMessageId = (params, messageId) => {
  if (typeof window === 'undefined') {
    return;
  }
  const normalizedId = Number(messageId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
    return;
  }
  try {
    const key = buildChatSeenStorageKey(params);
    window.localStorage.setItem(key, String(Math.floor(normalizedId)));
  } catch (error) {
    // Ignore storage failures and keep chat functional.
  }
};

export const countUnreadIncomingMessages = ({
  messages,
  currentUserId,
  lastSeenMessageId
}) => {
  const userId = Number(currentUserId);
  const seenId = Number(lastSeenMessageId) || 0;
  if (!Array.isArray(messages) || !Number.isFinite(userId)) {
    return 0;
  }
  return messages.reduce((count, message) => {
    const messageId = Number(message?.id);
    const senderId = Number(message?.senderId);
    if (!Number.isFinite(messageId) || messageId <= seenId) {
      return count;
    }
    if (senderId === userId) {
      return count;
    }
    return count + 1;
  }, 0);
};
