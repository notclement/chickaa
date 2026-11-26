import type { AdminTrip, AdminTripsResponse, TripTag } from '@ncc/contracts';
import { schema } from '@ncc/db';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { currentUser, requireAuth } from '../auth/session.ts';
import { notFound } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';

const { trips, users } = schema;

/** "YYYY-MM-DD" for today in the given time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone });
}

/**
 * Status tag for the admin list (precedence top to bottom):
 *   deleted → ended → pending_settlement → needs_finishing → ongoing → active
 */
export function tripTag(
  t: { status: string; deletedAt: Date | null; startDate: string | null; endDate: string | null },
  stats: { expenseCount: number; openTransfers: number },
  today: string,
): TripTag {
  if (t.deletedAt) return 'deleted';
  if (t.status !== 'active') return stats.openTransfers === 0 ? 'ended' : 'pending_settlement';
  if (t.endDate && t.endDate < today) return 'needs_finishing';
  const withinDates = !!t.startDate && t.startDate <= today && (!t.endDate || today <= t.endDate);
  if (withinDates || stats.expenseCount > 0) return 'ongoing';
  return 'active';
}

export const adminRoutes = new Hono<Env>();
adminRoutes.use('*', requireAuth);
adminRoutes.use('*', async (c, next) => {
  if (!currentUser(c).isAdmin) throw notFound(); // the admin area doesn't exist for anyone else
  await next();
});

/** Every trip on the app, with a status tag. Read-only. */
adminRoutes.get('/trips', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const rows = await db
    .select({
      trip: trips,
      ownerName: users.displayName,
      ownerUsername: users.username,
      memberCount: sql<number>`(select count(*)::int from trip_members m where m.trip_id = ${trips.id} and m.left_at is null)`,
      iAmMember: sql<boolean>`exists(select 1 from trip_members m where m.trip_id = ${trips.id} and m.user_id = ${me.id} and m.left_at is null)`,
      expenseCount: sql<number>`(select count(*)::int from expenses e where e.trip_id = ${trips.id} and e.deleted_at is null)`,
      totalSpent: sql<string>`(select coalesce(sum(e.base_amount), 0)::text from expenses e where e.trip_id = ${trips.id} and e.deleted_at is null)`,
      openTransfers: sql<number>`(
        select count(*)::int from settlements s
        join settlement_plans p on p.id = s.plan_id
        where s.trip_id = ${trips.id} and p.superseded_at is null and s.status not in ('confirmed', 'cancelled')
      )`,
    })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.createdBy))
    .orderBy(desc(trips.createdAt));

  const today = todayIn(c.var.config.timeZone);
  const list: AdminTrip[] = rows.map((r) => ({
    id: r.trip.id,
    name: r.trip.name,
    baseCurrency: r.trip.baseCurrency,
    ownerName: r.ownerName,
    ownerUsername: r.ownerUsername,
    memberCount: r.memberCount,
    expenseCount: r.expenseCount,
    totalSpent: r.totalSpent,
    startDate: r.trip.startDate,
    endDate: r.trip.endDate,
    createdAt: r.trip.createdAt.toISOString(),
    tag: tripTag(r.trip, r, today),
    iAmMember: r.iAmMember,
  }));
  const counts: Record<string, number> = {};
  for (const t of list) counts[t.tag] = (counts[t.tag] ?? 0) + 1;
  const res: AdminTripsResponse = { trips: list, counts };
  return c.json(res);
});
