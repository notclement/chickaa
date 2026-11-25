import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError, type ZodType, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, 'NOT_FOUND', what);
export const forbidden = (msg = 'You can’t do that') => new HttpError(403, 'FORBIDDEN', msg);

/** Parses + validates a JSON body. Invalid JSON or schema errors → 400 VALIDATION. */
export async function body<S extends ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, 'VALIDATION', 'Request body must be JSON');
  }
  return schema.parse(raw);
}

export function errorResponse(err: unknown, c: Context) {
  if (err instanceof HttpError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    const first = Object.values(fields)[0] ?? 'Invalid input';
    return c.json({ error: { code: 'VALIDATION', message: first, details: { fields } } }, 400);
  }
  console.error('[api] unhandled error', err);
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
}

/** Postgres unique-violation check (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Route ids that aren't UUIDs can't exist → 404 instead of a database error. */
export function uuidParam(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v || !UUID.test(v)) throw notFound();
  return v;
}

export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown';
}
