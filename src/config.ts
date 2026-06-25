const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ?? '';
const rawPwaUrl = process.env.EXPO_PUBLIC_PWA_URL?.trim() ?? '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');
export const PWA_URL = rawPwaUrl.replace(/\/+$/, '');

// Fallback when EXPO_PUBLIC_PWA_URL is unset, e.g. a production build that forgot
// to set it. Points at the Cloudflare `principal` branch deployment, not the root
// domain: as of 2026-06-25 https://xetudashbord.pages.dev still serves an older
// build. Revisit once the root domain is confirmed to match `principal`.
const DEFAULT_PWA_URL = 'https://principal.xetudashbord.pages.dev';
const DEFAULT_PWA_URL_BY_PLATFORM: Record<string, string> = {
  android: DEFAULT_PWA_URL,
  default: DEFAULT_PWA_URL,
  ios: DEFAULT_PWA_URL,
  web: DEFAULT_PWA_URL,
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
