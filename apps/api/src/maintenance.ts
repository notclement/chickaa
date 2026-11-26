import { schema, type Db } from '@ncc/db';
import { and, isNotNull, lt, or, sql } from 'drizzle-orm';

/** Housekeeping: drop sessions that ended over a week ago and stale rate-limit windows. */
export async function cleanup(db: Db): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(
      or(
        lt(schema.sessions.expiresAt, sql`now() - interval '7 days'`),
        and(isNotNull(schema.sessions.revokedAt), lt(schema.sessions.revokedAt, sql`now() - interval '7 days'`)),
      ),
    );
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.windowStart, sql`now() - interval '1 day'`));
}
