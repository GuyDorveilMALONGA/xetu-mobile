const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function hasApiBaseUrl() {
  return API_BASE_URL.length > 0;
}
