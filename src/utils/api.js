const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const buildApiUrl = (path = '') => {
  if (!path) {
    return API_BASE_URL;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE_URL) {
    return normalizedPath;
  }
  return `${API_BASE_URL.replace(/\/+$/, '')}${normalizedPath}`;
};
