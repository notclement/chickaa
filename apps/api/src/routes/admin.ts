import { DeleteTripRequest, SetSupporterRequest, type AdminTrip, type AdminTripsResponse, type AdminUser, type AdminUsersResponse, type TripTag } from '@ncc/contracts';
import { schema } from '@ncc/db';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { currentUser, requireAuth } from '../auth/session.ts';
import { body, HttpError, notFound, uuidParam } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';
import { supporterOf } from '../lib/users.ts';

const {
  trips,
  users,
  tripMembers,
  invitations,
  tripFxRates,
  expenses,
  expensePayers,
  expenseSplits,
  expenseRevisions,
  settlementPlans,
  settlements,
  settlementEvents,
} = schema;

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

/** Every trip on the app with its tag, newest first. */
async function allTrips(db: Env['Variables']['db'], meId: string, timeZone: string): Promise<AdminTrip[]> {
  const rows = await db
    .select({
      trip: trips,
      ownerName: users.displayName,
      ownerUsername: users.username,
      memberCount: sql<number>`(select count(*)::int from trip_members m where m.trip_id = ${trips.id} and m.left_at is null)`,
      iAmMember: sql<boolean>`exists(select 1 from trip_members m where m.trip_id = ${trips.id} and m.user_id = ${meId} and m.left_at is null)`,
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

  const today = todayIn(timeZone);
  return rows.map((r) => ({
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
}

/** Every trip on the app, with a status tag. Read-only. */
adminRoutes.get('/trips', async (c) => {
  const list = await allTrips(c.var.db, currentUser(c).id, c.var.config.timeZone);
  const counts: Record<string, number> = {};
  for (const t of list) counts[t.tag] = (counts[t.tag] ?? 0) + 1;
  const res: AdminTripsResponse = { trips: list, counts };
  return c.json(res);
});

/** Every user, with the trips they own or belong to (newest trip first). Read-only. */
adminRoutes.get('/users', async (c) => {
  const db = c.var.db;
  const tripList = await allTrips(db, currentUser(c).id, c.var.config.timeZone);
  const byId = new Map(tripList.map((t, i) => [t.id, { t, i }]));
  const people = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
      createdAt: users.createdAt,
      supporterUntil: users.supporterUntil,
      supporterLifetime: users.supporterLifetime,
      referredBy: sql<string | null>`(select r.username::text from users r where r.id = "users"."referred_by")`,
      invited: sql<number>`(select count(*)::int from users r where r.referred_by = "users"."id")`,
      lastSeenMs: sql<number | null>`(select (extract(epoch from max(s.last_seen_at)) * 1000)::float8 from sessions s where s.user_id = "users"."id")`,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
  const memberships = await db
    .select({ userId: tripMembers.userId, tripId: tripMembers.tripId, role: tripMembers.role, leftAt: tripMembers.leftAt, createdBy: trips.createdBy })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId));

  const perUser = new Map<string, { trip: AdminUser['trips'][number]; order: number }[]>();
  for (const m of memberships) {
    const hit = byId.get(m.tripId);
    if (!hit) continue;
    const list = perUser.get(m.userId) ?? [];
    list.push({
      trip: { id: hit.t.id, name: hit.t.name, tag: hit.t.tag, role: m.createdBy === m.userId ? 'owner' : 'member', left: m.leftAt !== null },
      order: hit.i,
    });
    perUser.set(m.userId, list);
  }
  const res: AdminUsersResponse = {
    users: people.map((p) => ({
      id: p.id,
      username: p.username,
      displayName: p.displayName,
      isAdmin: p.isAdmin,
      createdAt: p.createdAt.toISOString(),
      supporter: supporterOf(p),
      referredBy: p.referredBy,
      invited: p.invited,
      lastSeenAt: p.lastSeenMs == null ? null : new Date(Number(p.lastSeenMs)).toISOString(),
      trips: (perUser.get(p.id) ?? []).sort((a, b) => a.order - b.order).map((x) => x.trip),
    })),
  };
  return c.json(res);
});

/**
 * Permanently delete a trip and everything in it (for test trips). Unlike the owner's soft delete,
 * this works in any state and can't be undone, so the exact trip name must be typed.
 */
adminRoutes.delete('/trips/:id', async (c) => {
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { confirmName } = await body(c, DeleteTripRequest);
  const [trip] = await db.select({ id: trips.id, name: trips.name }).from(trips).where(eq(trips.id, tripId));
  if (!trip) throw notFound();
  if (confirmName.trim() !== trip.name) throw new HttpError(400, 'VALIDATION', 'Type the trip name exactly to delete it');

  await db.transaction(async (tx) => {
    const sIds = tx.select({ id: settlements.id }).from(settlements).where(eq(settlements.tripId, tripId));
    await tx.delete(settlementEvents).where(inArray(settlementEvents.settlementId, sIds));
    await tx.delete(settlements).where(eq(settlements.tripId, tripId));
    await tx.delete(settlementPlans).where(eq(settlementPlans.tripId, tripId));
    const eIds = tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.tripId, tripId));
    await tx.delete(expenseRevisions).where(inArray(expenseRevisions.expenseId, eIds));
    await tx.delete(expensePayers).where(inArray(expensePayers.expenseId, eIds));
    await tx.delete(expenseSplits).where(inArray(expenseSplits.expenseId, eIds));
    await tx.delete(expenses).where(eq(expenses.tripId, tripId));
    await tx.delete(tripFxRates).where(eq(tripFxRates.tripId, tripId));
    await tx.delete(invitations).where(eq(invitations.tripId, tripId));
    await tx.delete(tripMembers).where(eq(tripMembers.tripId, tripId));
    await tx.delete(trips).where(eq(trips.id, tripId));
  });
  if (c.var.config.nodeEnv !== 'test') console.log(`admin hard-deleted trip ${tripId} (${trip.name})`);
  return c.json({ deleted: true });
});

/**
 * Set someone's Supporter status: +1 month (from now or their current end, whichever is later),
 * lifetime, or remove both.
 */
adminRoutes.post('/users/:id/supporter', async (c) => {
  const db = c.var.db;
  const id = uuidParam(c, 'id');
  const { action } = await body(c, SetSupporterRequest);
  const set =
    action === 'lifetime'
      ? { supporterLifetime: true }
      : action === 'remove'
        ? { supporterLifetime: false, supporterUntil: null }
        : { supporterUntil: sql`greatest(coalesce(${users.supporterUntil}, now()), now()) + interval '1 month'` };
  const [u] = await db
    .update(users)
    .set(set)
    .where(eq(users.id, id))
    .returning({ supporterUntil: users.supporterUntil, supporterLifetime: users.supporterLifetime });
  if (!u) throw notFound();
  return c.json({ supporter: supporterOf(u) });
});
