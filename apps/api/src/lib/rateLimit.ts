import { schema, type Db } from '@ncc/db';
import { eq, sql } from 'drizzle-orm';
import { HttpError } from './http.ts';

/**
 * Fixed-window rate limiter stored in Postgres (no Redis needed).
 * Atomically increments the counter for `key`, resetting it when the window has passed.
 */
let scale = 1;
/** Multiplies every limit (e.g. RATE_LIMIT_SCALE=100 for end-to-end tests). */
export function setRateLimitScale(n: number) {
  scale = n > 0 ? n : 1;
}

export async function rateLimit(db: Db, key: string, baseLimit: number, windowSeconds: number): Promise<void> {
  const limit = baseLimit * scale;
  const t = schema.rateLimits;
  const expired = sql`${t.windowStart} < now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(t)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: t.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${t.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${t.windowStart} END`,
      },
    })
    .returning({ count: t.count, windowStart: t.windowStart });

  if (row && row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((row.windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000));
    const minutes = Math.ceil(retryAfter / 60);
    throw new HttpError(429, 'RATE_LIMITED', `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, {
      retryAfter,
    });
  }
}

export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, key));
}
