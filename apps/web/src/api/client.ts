import type { ApiError } from '@ncc/contracts';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Typed fetch wrapper. Same origin, cookie session, CSRF header on writes. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (init.method && init.method !== 'GET') headers.set('X-Requested-With', 'ncc');

  const res = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body?.error.code ?? 'HTTP', body?.error.message ?? res.statusText);
  }
  return (await res.json()) as T;
}
