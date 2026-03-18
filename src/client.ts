import { getAccessToken } from './auth.js';
import { DEFAULT_TIMEOUT_MS, UPLOAD_TIMEOUT_MS, API_BASE_URL, MAX_PAGES } from './constants.js';

export interface GPCError {
  code: number;
  message: string;
  status: string;
  details?: any[];
}

export class GPCClientError extends Error {
  constructor(
    public status: number,
    public error: GPCError,
  ) {
    super(`Google Play API Error (${status}): [${error.status}] ${error.message}`);
    this.name = 'GPCClientError';
  }
}

function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return {} as T;
  }

  const body = await response.text();

  if (!response.ok) {
    let error: GPCError;
    try {
      const parsed = JSON.parse(body);
      error = parsed.error || {
        code: response.status,
        message: body.slice(0, 500),
        status: 'UNKNOWN',
      };
    } catch {
      error = {
        code: response.status,
        message: body.slice(0, 500),
        status: 'UNKNOWN',
      };
    }

    // Rate limit handling
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new GPCClientError(429, {
        code: 429,
        message: `Too many requests. Retry after ${retryAfter || '30'} seconds.`,
        status: 'RATE_LIMITED',
      });
    }

    // Quota exceeded
    if (response.status === 403) {
      throw new GPCClientError(403, {
        code: 403,
        message: error.message || 'Access denied. Check service account permissions in Google Play Console.',
        status: error.status || 'FORBIDDEN',
      });
    }

    throw new GPCClientError(response.status, error);
  }

  if (!body) return {} as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    return body as unknown as T;
  }
}

const RATE_LIMIT_RETRY_DELAY_MS = 2_000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    signal: createAbortSignal(timeoutMs),
  });

  // Retry once on 429 (rate limit)
  if (response.status === 429) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
    return fetch(url, {
      ...options,
      signal: createAbortSignal(timeoutMs),
    });
  }

  return response;
}

async function authHeaders(contentType = 'application/json'): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': contentType,
  };
}

export function getPackageName(): string {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!pkg) {
    throw new Error('Missing GOOGLE_PLAY_PACKAGE_NAME in environment. Set it in .env');
  }
  return pkg;
}

export async function gpcGet<T = any>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const response = await fetchWithRetry(url.toString(), {
    headers: await authHeaders(),
  }, DEFAULT_TIMEOUT_MS);
  return handleResponse<T>(response);
}

export async function gpcPost<T = any>(path: string, body?: any): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  }, DEFAULT_TIMEOUT_MS);
  return handleResponse<T>(response);
}

export async function gpcPut<T = any>(path: string, body: any): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  }, DEFAULT_TIMEOUT_MS);
  return handleResponse<T>(response);
}

export async function gpcPatch<T = any>(path: string, body: any): Promise<T> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  }, DEFAULT_TIMEOUT_MS);
  return handleResponse<T>(response);
}

export async function gpcDelete(path: string): Promise<void> {
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  }, DEFAULT_TIMEOUT_MS);
  await handleResponse<void>(response);
}

// Upload binary data (images) - longer timeout
export async function gpcUpload<T = any>(path: string, data: Uint8Array, mimeType: string): Promise<T> {
  const token = await getAccessToken();
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType,
    },
    body: data as any,
  }, UPLOAD_TIMEOUT_MS);
  return handleResponse<T>(response);
}
