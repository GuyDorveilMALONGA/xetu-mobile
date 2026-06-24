import { API_BASE_URL } from './config';
import { ApiError, toApiError } from './errors';
import type { components } from './types.gen';

export type Bus = components['schemas']['BusPosition'];
export type BusesResponse = components['schemas']['BusesResponse'];
export type StopsSearchResponse = components['schemas']['StopsSearchResponse'];
export type StopSearchResult = components['schemas']['StopSearchResult'];

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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  queryParams?: URLSearchParams;
  body?: unknown;
  signal?: AbortSignal;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError('config', 'Missing EXPO_PUBLIC_API_BASE_URL.');
  }

  const method = options.method ?? 'GET';
  const controller = new AbortController();

  // Set up timeout that merges with external signal aborts
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const handleExternalAbort = () => {
    controller.abort();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', handleExternalAbort);
    }
  }

  let url = `${API_BASE_URL}${path}`;
  if (options.queryParams) {
    const queryStr = options.queryParams.toString();
    if (queryStr) {
      url += `?${queryStr}`;
    }
  }

  const headers: Record<string, string> = {};
  let bodyInit: string | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: bodyInit,
      signal: controller.signal,
    });
  } catch (error) {
    throw toApiError(error);
  } finally {
    clearTimeout(timeout);
    if (options.signal) {
      options.signal.removeEventListener('abort', handleExternalAbort);
    }
  }

  if (!response.ok) {
    let retryAfter: number | undefined;
    const header = response.headers.get('retry-after');
    if (header) {
      const parsed = Number(header);
      retryAfter = Number.isFinite(parsed) ? parsed : undefined;
    }
    throw new ApiError('http', `${method} ${path} failed with HTTP ${response.status}`, response.status, retryAfter);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('parse', `${method} ${path} returned invalid JSON.`);
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

export async function searchStops(q: string, lat?: number, lon?: number, signal?: AbortSignal): Promise<StopsSearchResponse> {
  const params = new URLSearchParams();
  params.append('q', q);
  if (lat !== undefined) {
    params.append('lat', String(lat));
  }
  if (lon !== undefined) {
    params.append('lon', String(lon));
  }

  return requestJson<StopsSearchResponse>('/api/stops/search', {
    method: 'GET',
    queryParams: params,
    signal,
  });
}

export async function getSubscriptions(sessionId: string, signal?: AbortSignal): Promise<string[]> {
  const params = new URLSearchParams();
  params.append('session_id', sessionId);

  const res = await requestJson<{ lignes: string[] }>('/api/subscriptions', {
    method: 'GET',
    queryParams: params,
    signal,
  });

  return res.lignes;
}

export async function addSubscription(sessionId: string, ligne: string, signal?: AbortSignal): Promise<void> {
  await requestJson<unknown>('/api/subscriptions', {
    method: 'POST',
    body: {
      session_id: sessionId,
      ligne: ligne,
    },
    signal,
  });
}

export async function removeSubscription(sessionId: string, ligne: string, signal?: AbortSignal): Promise<void> {
  const params = new URLSearchParams();
  params.append('session_id', sessionId);

  // Endpoint is DELETE /api/subscriptions/{ligne}?session_id=...
  await requestJson<unknown>(`/api/subscriptions/${encodeURIComponent(ligne)}`, {
    method: 'DELETE',
    queryParams: params,
    signal,
  });
}
