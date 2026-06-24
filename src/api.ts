import { API_BASE_URL } from './config';
import { ApiError, toApiError } from './errors';
import type { components } from './types.gen';

export type Bus = components['schemas']['BusPosition'];
export type BusesResponse = components['schemas']['BusesResponse'];

export type BusesPayload = {
  buses: Bus[];
  total: number;
  timestamp: string | null;
  raw: BusesResponse;
};

const REQUEST_TIMEOUT_MS = 8000;

function normalizeBuses(payload: unknown): BusesResponse {
  if (!payload || typeof payload !== 'object') {
    throw new ApiError('parse', 'GET /api/buses returned a non-object payload.');
  }

  const record = payload as Partial<BusesResponse>;
  if (!Array.isArray(record.buses)) {
    throw new ApiError('parse', 'GET /api/buses must return { buses: [...] }.');
  }

  return {
    buses: record.buses,
    total: typeof record.total === 'number' ? record.total : record.buses.length,
    timestamp: record.timestamp ?? null,
    error: record.error ?? null,
  };
}

async function requestJson<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('config', 'Missing EXPO_PUBLIC_API_BASE_URL.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
  } catch (error) {
    throw toApiError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let retryAfter: number | undefined;
    const header = response.headers.get('retry-after');
    if (header) {
      const parsed = Number(header);
      retryAfter = Number.isFinite(parsed) ? parsed : undefined;
    }
    throw new ApiError('http', `GET ${path} failed with HTTP ${response.status}`, response.status, retryAfter);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('parse', `GET ${path} returned invalid JSON.`);
  }
}

export async function fetchBuses(): Promise<BusesPayload> {
  const raw = normalizeBuses(await requestJson<unknown>('/api/buses'));
  if (raw.error) {
    throw new ApiError('http', raw.error, 200);
  }

  return {
    buses: raw.buses,
    total: raw.total,
    timestamp: raw.timestamp ?? null,
    raw,
  };
}
