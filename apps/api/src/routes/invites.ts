import type { InvitePreview, JoinResponse } from '@ncc/contracts';
import { schema, type Db } from '@ncc/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { sha256 } from '../auth/crypto.ts';
import { currentUser, requireAuth } from '../auth/session.ts';
import { clientIp, HttpError } from '../lib/http.ts';
import { rateLimit } from '../lib/rateLimit.ts';
import type { Env } from '../lib/types.ts';

const { invitations, trips, tripMembers, users } = schema;

type Reason = InvitePreview['reason'];

function check(inv: typeof invitations.$inferSelect | undefined, trip: typeof trips.$inferSelect | undefined): Reason {
  if (!inv || !trip) return 'not_found';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt && inv.expiresAt <= new Date()) return 'expired';
  if (inv.maxUses != null && inv.usageCount >= inv.maxUses) return 'used_up';
  if (trip.status !== 'active') return 'trip_closed';
  return 'ok';
}

const MESSAGES: Record<Exclude<Reason, 'ok'>, string> = {
  not_found: 'This invite link isn’t valid. Ask for a new one.',
  revoked: 'This invite link was switched off. Ask for a new one.',
  expired: 'This invite link has expired. Ask for a new one.',
  used_up: 'This invite link has been used the maximum number of times.',
  trip_closed: 'This trip is no longer taking new members.',
};

async function find(db: Db, token: string) {
  if (!token || token.length > 100) return { inv: undefined, trip: undefined };
  const [row] = await db
    .select({ inv: invitations, trip: trips })
    .from(invitations)
    .innerJoin(trips, eq(trips.id, invitations.tripId))
    .where(eq(invitations.tokenHash, sha256(token)))
    .limit(1);
  return { inv: row?.inv, trip: row?.trip };
}

async function isMember(db: Db, tripId: string, userId: string) {
  const [m] = await db
    .select({ id: tripMembers.id })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId), isNull(tripMembers.leftAt)))
    .limit(1);
  return !!m;
}

export const inviteRoutes = new Hono<Env>();

/** Public preview: anyone with the link sees the trip name before signing up. */
inviteRoutes.get('/:token', async (c) => {
  const db = c.var.db;
  await rateLimit(db, `invite-preview:ip:${clientIp(c)}`, 120, 15 * 60);
  const { inv, trip } = await find(db, c.req.param('token'));
  const reason = check(inv, trip);

  let tripInfo: InvitePreview['trip'] = null;
  if (trip && reason !== 'not_found') {
    const [owner] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, trip.createdBy));
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, trip.id), isNull(tripMembers.leftAt)));
    tripInfo = { id: trip.id, name: trip.name, baseCurrency: trip.baseCurrency, memberCount: n, ownerName: owner?.name ?? '' };
  }
  const me = c.var.user;
  const res: InvitePreview = {
    valid: reason === 'ok',
    reason,
    trip: tripInfo,
    alreadyMember: !!(me && trip && (await isMember(db, trip.id, me.id))),
  };
  return c.json(res);
});

/** Join. Idempotent: joining twice is fine and doesn't use up the link. */
inviteRoutes.post('/:token/join', requireAuth, async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  await rateLimit(db, `invite-join:ip:${clientIp(c)}`, 60, 15 * 60);

  const result = await db.transaction(async (tx) => {
    const { inv, trip } = await find(tx as unknown as Db, c.req.param('token'));
    if (!inv || !trip) throw new HttpError(404, 'INVITE_INVALID', MESSAGES.not_found);
    // Lock the invitation so two people can't both take the last use.
    await tx.execute(sql`select 1 from ${invitations} where ${invitations.id} = ${inv.id} for update`);
    const [fresh] = await tx.select().from(invitations).where(eq(invitations.id, inv.id));

    const [existing] = await tx
      .select()
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, trip.id), eq(tripMembers.userId, me.id)))
      .limit(1);
    if (existing && !existing.leftAt) return { tripId: trip.id, alreadyMember: true };

    const reason = check(fresh, trip);
    if (reason !== 'ok') throw new HttpError(410, 'INVITE_INVALID', MESSAGES[reason], { reason });

    if (existing) {
      await tx.update(tripMembers).set({ leftAt: null, joinedAt: new Date() }).where(eq(tripMembers.id, existing.id));
    } else {
      await tx.insert(tripMembers).values({ tripId: trip.id, userId: me.id, role: 'member' });
    }
    await tx
      .update(invitations)
      .set({ usageCount: sql`${invitations.usageCount} + 1` })
      .where(eq(invitations.id, inv.id));
    return { tripId: trip.id, alreadyMember: false };
  });

  const res: JoinResponse = result;
  return c.json(res);
});
