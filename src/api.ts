export type Bus = {
  id?: string | number;
  ligne?: string;
  arret_signale?: string;
  arret_estime?: string;
  sens?: string;
  lat?: number | null;
  lon?: number | null;
  next_arret?: string | null;
  confidence_level?: string;
  confidence_reason?: string;
  tracking_mode?: string;
  tracking_reason?: string;
  tracking_freshness_sec?: number | null;
  [key: string]: unknown;
};

export type BusesPayload = {
  buses: Bus[];
  raw: unknown;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? '';

export function getApiBaseUrl() {
  return API_BASE_URL;
}

function normalizeBuses(payload: unknown): Bus[] {
  if (Array.isArray(payload)) {
    return payload as Bus[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.buses)) return record.buses as Bus[];
    if (Array.isArray(record.data)) return record.data as Bus[];
    if (Array.isArray(record.items)) return record.items as Bus[];
  }

  return [];
}

export async function fetchBuses(): Promise<BusesPayload> {
  if (!API_BASE_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE_URL. Create a local .env from .env.example.');
  }

  const response = await fetch(`${API_BASE_URL}/api/buses`);
  if (!response.ok) {
    throw new Error(`GET /api/buses failed with HTTP ${response.status}`);
  }

  const raw = await response.json();
  return { buses: normalizeBuses(raw), raw };
}
