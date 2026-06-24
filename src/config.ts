const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
const rawPwaUrl = process.env.EXPO_PUBLIC_PWA_URL?.trim() ?? '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
export const PWA_URL = rawPwaUrl.replace(/\/+$/, '');

const DEFAULT_PWA_PORT = '8083';
const DEFAULT_PWA_URL_BY_PLATFORM: Record<string, string> = {
  android: `http://10.0.2.2:${DEFAULT_PWA_PORT}`,
  default: `http://127.0.0.1:${DEFAULT_PWA_PORT}`,
  ios: `http://127.0.0.1:${DEFAULT_PWA_PORT}`,
  web: `http://127.0.0.1:${DEFAULT_PWA_PORT}`,
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getUrlOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function hasApiBaseUrl() {
  return API_BASE_URL.length > 0;
}

export function getPwaUrl(platform = 'default') {
  const baseUrl = PWA_URL || DEFAULT_PWA_URL_BY_PLATFORM[platform] || DEFAULT_PWA_URL_BY_PLATFORM.default;

  if (!API_BASE_URL) {
    return baseUrl;
  }

  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has('api')) {
      url.searchParams.set('api', API_BASE_URL);
    }
    return trimTrailingSlash(url.toString());
  } catch {
    return baseUrl;
  }
}

export function getAllowedWebViewOrigins(platform = 'default') {
  const origins = [getUrlOrigin(getPwaUrl(platform)), getUrlOrigin(API_BASE_URL)].filter(
    (origin): origin is string => origin !== null,
  );

  return [...new Set(origins)];
}
