import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: 'config' | 'http' | 'contract' | 'network',
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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

function normalizeBuses(payload: unknown): Bus[] {
  if (!payload || typeof payload !== 'object') {
    throw new ApiError('GET /api/buses returned a non-object payload.', 'contract');
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.buses)) {
    throw new ApiError('GET /api/buses must return { buses: [...] }.', 'contract');
  }

  return record.buses as Bus[];
}

export async function fetchBuses(): Promise<BusesPayload> {
  if (!API_BASE_URL) {
    throw new ApiError('Missing EXPO_PUBLIC_API_BASE_URL. Create a local .env from .env.example.', 'config');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/buses`);
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Network request failed.', 'network');
  }

  if (!response.ok) {
    throw new ApiError(`GET /api/buses failed with HTTP ${response.status}`, 'http', response.status);
  }

  const raw = await response.json();
  return { buses: normalizeBuses(raw), raw };
}
