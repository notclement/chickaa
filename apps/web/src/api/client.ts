import type { ApiError } from '@ncc/contracts';
import { serverStatus } from './serverStatus.ts';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
    readonly details: unknown = undefined,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

/**
 * Typed fetch wrapper: same origin, cookie session, CSRF header on writes.
 * Requests that take a while flag the server as "waking up" so the UI can say so
 * (the free host sleeps after 15 idle minutes).
 */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Accept', 'application/json');
  const method = (rest.method ?? 'GET').toUpperCase();
  if (method !== 'GET') headers.set('X-Requested-With', 'ncc');
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  const done = serverStatus.track();
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...rest,
      method,
      headers,
      credentials: 'same-origin',
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK',
      navigator.onLine ? 'Couldn’t reach the server. Check your connection and try again.' : 'You’re offline.',
    );
  } finally {
    done();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    const details = body?.error.details as { fields?: Record<string, string> } | undefined;
    throw new ApiRequestError(
      res.status,
      body?.error.code ?? 'HTTP',
      body?.error.message ?? `Request failed (${res.status})`,
      details?.fields ?? {},
      body?.error.details,
    );
  }
  return (await res.json()) as T;
}

export const post = <T>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json });
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
