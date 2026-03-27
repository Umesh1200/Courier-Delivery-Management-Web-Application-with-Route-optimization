const LOCAL_STORAGE_EXACT_KEYS = [
  'authToken',
  'userRole',
  'userName',
  'userId',
  'userEmail',
  'bookingDraft',
  'pendingKhaltiForm',
  'pendingKhaltiPricing',
  'pendingKhaltiPidx'
];

const LOCAL_STORAGE_PREFIXES = [
  '__cf_notifications_',
  '__chat_seen_',
  '__tracking_notice_',
  '__tracking_stage_notice_',
  '__tracking_chat_',
  'ratingFlags_'
];

const SESSION_STORAGE_EXACT_KEYS = [
  '__courierNavPayload',
  '__courierNavRuntime'
];

const SESSION_STORAGE_PREFIXES = [
  '__courierNav'
];

const removeKeysByPrefix = (storage, prefixes = []) => {
  if (!storage || !Array.isArray(prefixes) || prefixes.length <= 0) {
    return;
  }
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      storage.removeItem(key);
    }
  }
};

export const clearClientAuthState = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    LOCAL_STORAGE_EXACT_KEYS.forEach((key) => window.localStorage.removeItem(key));
    removeKeysByPrefix(window.localStorage, LOCAL_STORAGE_PREFIXES);
  } catch (error) {
    // Ignore localStorage failures (privacy mode, quota, etc).
  }

  try {
    SESSION_STORAGE_EXACT_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
    removeKeysByPrefix(window.sessionStorage, SESSION_STORAGE_PREFIXES);
  } catch (error) {
    // Ignore sessionStorage failures (privacy mode, quota, etc).
  }

  try {
    delete window.__courierNavOpenTs;
  } catch (error) {
    // Ignore global cleanup failures.
  }
};
