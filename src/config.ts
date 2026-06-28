import Constants from 'expo-constants';

type LegacyManifest = {
  debuggerHost?: string;
};

type ManifestWithExpoGo = {
  extra?: {
    expoGo?: {
      debuggerHost?: string;
    };
  };
};

function getMetroHost() {
  const manifest2 = Constants.manifest2 as ManifestWithExpoGo | null;
  const legacyManifest = Constants.manifest as LegacyManifest | null;
  const hostUri = Constants.expoConfig?.hostUri || manifest2?.extra?.expoGo?.debuggerHost || legacyManifest?.debuggerHost;
  if (typeof hostUri === 'string') {
    return hostUri.split(':')[0];
  }
  return null;
}

const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || '';
const rawPwaUrl = process.env.EXPO_PUBLIC_PWA_URL?.trim() || '';

const metroHost = getMetroHost();

const fallbackApiBaseUrl = metroHost ? `http://${metroHost}:8000` : '';
const fallbackPwaUrl = metroHost ? `http://${metroHost}:8090` : 'https://xetudashbord.pages.dev';

export const API_BASE_URL = (rawApiBaseUrl || fallbackApiBaseUrl).replace(/\/+$/, '');
export const PWA_URL = (rawPwaUrl || fallbackPwaUrl).replace(/\/+$/, '');

// Fallback when EXPO_PUBLIC_PWA_URL is unset, e.g. a production build that forgot
// to set it. Points at the Cloudflare root domain — confirmed 2026-06-25 to serve
// the same build as the `principal` branch preview (identical content, correct
// markers present, old UI absent).
const DEFAULT_PWA_URL = 'https://xetudashbord.pages.dev';
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
