import {
  CreateInvitationRequest,
  CreateTripRequest,
  UpdateTripRequest,
  type CreatedInvitation,
  type Invitation,
  type InvitationListResponse,
  type Member,
  type TripDetail,
  type TripListResponse,
  type TripSummary,
} from '@ncc/contracts';
import { schema, type Db } from '@ncc/db';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { randomToken, sha256 } from '../auth/crypto.ts';
import { currentUser, requireAuth } from '../auth/session.ts';
import { body, forbidden, HttpError, notFound, uuidParam } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';

const { trips, tripMembers, users, invitations, expenses } = schema;

type TripRow = typeof trips.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;

const memberCountSql = sql<number>`(
  select count(*)::int from ${tripMembers} m
  where m.trip_id = ${trips.id} and m.left_at is null
)`;

type Role = 'owner' | 'member' | 'viewer';

function toSummary(t: TripRow, myRole: Role, memberCount: number): TripSummary {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    baseCurrency: t.baseCurrency,
    startDate: t.startDate,
    endDate: t.endDate,
    status: t.status,
    myRole,
    memberCount,
    createdAt: t.createdAt.toISOString(),
  };
}

export function toInvitation(i: InvitationRow, now = new Date()): Invitation {
  const expired = !!i.expiresAt && i.expiresAt <= now;
  const usedUp = i.maxUses != null && i.usageCount >= i.maxUses;
  return {
    id: i.id,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt?.toISOString() ?? null,
    maxUses: i.maxUses,
    usageCount: i.usageCount,
    revokedAt: i.revokedAt?.toISOString() ?? null,
    active: !i.revokedAt && !expired && !usedUp,
  };
}

/** The trip + caller's role. Non-members get 404 so trip ids can't be probed. */
export async function membership(db: Db, tripId: string, userId: string) {
  const [row] = await db
    .select({ trip: trips, role: tripMembers.role })
    .from(trips)
    .innerJoin(tripMembers, and(eq(tripMembers.tripId, trips.id), eq(tripMembers.userId, userId)))
    .where(and(eq(trips.id, tripId), isNull(tripMembers.leftAt), isNull(trips.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Trip not found');
  return row;
}

async function members(db: Db, tripId: string): Promise<Member[]> {
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      avatarVersion: users.avatarVersion,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
      disabledAt: users.disabledAt,
    })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(and(eq(tripMembers.tripId, tripId), isNull(tripMembers.leftAt)))
    .orderBy(asc(tripMembers.joinedAt), asc(users.id));
  return rows.map(({ disabledAt, ...r }) => ({ ...r, joinedAt: r.joinedAt.toISOString(), disabled: !!disabledAt }));
}

export async function detail(db: Db, trip: TripRow, myRole: Role): Promise<TripDetail> {
  const list = await members(db, trip.id);
  return { ...toSummary(trip, myRole, list.length), members: list, createdBy: trip.createdBy };
}

/**
 * Read access: members as usual; the admin may also VIEW any trip they're not in (role "viewer",
 * read-only), including deleted ones. Every write still goes through `membership()`.
 */
export async function viewAccess(db: Db, tripId: string, user: { id: string; isAdmin: boolean }): Promise<{ trip: TripRow; role: Role }> {
  try {
    return await membership(db, tripId, user.id);
  } catch (err) {
    if (!user.isAdmin) throw err;
    const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw err;
    return { trip, role: 'viewer' };
  }
}

export const tripRoutes = new Hono<Env>();
tripRoutes.use('*', requireAuth);

tripRoutes.get('/', async (c) => {
  const me = currentUser(c);
  const rows = await c.var.db
    .select({ trip: trips, role: tripMembers.role, memberCount: memberCountSql })
    .from(tripMembers)
    .innerJoin(trips, eq(trips.id, tripMembers.tripId))
    .where(and(eq(tripMembers.userId, me.id), isNull(tripMembers.leftAt), isNull(trips.deletedAt)))
    .orderBy(sql`case ${trips.status} when 'active' then 0 when 'completed' then 1 else 2 end`, desc(trips.createdAt));
  const res: TripListResponse = { trips: rows.map((r) => toSummary(r.trip, r.role, r.memberCount)) };
  return c.json(res);
});

tripRoutes.post('/', async (c) => {
  const me = currentUser(c);
  const input = await body(c, CreateTripRequest);
  const trip = await c.var.db.transaction(async (tx) => {
    const [t] = await tx
      .insert(trips)
      .values({
        name: input.name,
        description: input.description || null,
        baseCurrency: input.baseCurrency,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdBy: me.id,
      })
      .returning();
    await tx.insert(tripMembers).values({ tripId: t!.id, userId: me.id, role: 'owner' });
    return t!;
  });
  return c.json(await detail(c.var.db, trip, 'owner'), 201);
});

tripRoutes.get('/:id', async (c) => {
  const me = currentUser(c);
  const { trip, role } = await viewAccess(c.var.db, uuidParam(c, 'id'), me);
  return c.json(await detail(c.var.db, trip, role));
});

tripRoutes.patch('/:id', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const input = await body(c, UpdateTripRequest);

  const updated = await db.transaction(async (tx) => {
    // Lock the trip row: serialises against expenses being added (ARCHITECTURE.md §5).
    const { trip, role } = await membership(tx as unknown as Db, tripId, me.id);
    if (role !== 'owner') throw forbidden('Only the trip owner can change trip settings');
    await tx.execute(sql`select 1 from ${trips} where ${trips.id} = ${tripId} for update`);

    if (input.baseCurrency && input.baseCurrency !== trip.baseCurrency) {
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(expenses)
        .where(and(eq(expenses.tripId, tripId), isNull(expenses.deletedAt)));
      if (n > 0) {
        throw new HttpError(409, 'TRIP_LOCKED', 'The base currency can’t change once expenses have been added');
      }
    }
    const startDate = input.startDate === undefined ? trip.startDate : input.startDate;
    const endDate = input.endDate === undefined ? trip.endDate : input.endDate;
    if (startDate && endDate && startDate > endDate) {
      throw new HttpError(400, 'VALIDATION', 'End date is before start date', { fields: { endDate: 'End date is before start date' } });
    }
    const [t] = await tx
      .update(trips)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.baseCurrency !== undefined && { baseCurrency: input.baseCurrency }),
        startDate,
        endDate,
        version: sql`${trips.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(trips.id, tripId))
      .returning();
    return { trip: t!, role };
  });
  return c.json(await detail(db, updated.trip, updated.role));
});

// ---------- invitations (owner only) ----------

async function requireOwner(db: Db, tripId: string, userId: string) {
  const m = await membership(db, tripId, userId);
  if (m.role !== 'owner') throw forbidden('Only the trip owner can manage invite links');
  return m;
}

tripRoutes.get('/:id/invitations', async (c) => {
  const me = currentUser(c);
  const tripId = uuidParam(c, 'id');
  await requireOwner(c.var.db, tripId, me.id);
  const rows = await c.var.db
    .select()
    .from(invitations)
    .where(eq(invitations.tripId, tripId))
    .orderBy(desc(invitations.createdAt));
  const res: InvitationListResponse = { invitations: rows.map((r) => toInvitation(r)) };
  return c.json(res);
});

tripRoutes.post('/:id/invitations', async (c) => {
  const me = currentUser(c);
  const tripId = uuidParam(c, 'id');
  const { trip } = await requireOwner(c.var.db, tripId, me.id);
  if (trip.status !== 'active') throw new HttpError(409, 'TRIP_LOCKED', 'This trip is closed to new members');
  const input = await body(c, CreateInvitationRequest);

  const token = randomToken(24);
  const [inv] = await c.var.db
    .insert(invitations)
    .values({
      tripId,
      tokenHash: sha256(token),
      createdBy: me.id,
      expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : null,
      maxUses: input.maxUses ?? null,
    })
    .returning();
  const res: CreatedInvitation = {
    invitation: toInvitation(inv!),
    token,
    url: `${c.var.config.publicOrigin}/join/${token}`,
  };
  return c.json(res, 201);
});

export const invitationRoutes = new Hono<Env>();
invitationRoutes.use('*', requireAuth);

invitationRoutes.delete('/:id', async (c) => {
  const me = currentUser(c);
  const id = uuidParam(c, 'id');
  const [inv] = await c.var.db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
  if (!inv) throw notFound('Invite not found');
  await requireOwner(c.var.db, inv.tripId, me.id);
  const [updated] = await c.var.db
    .update(invitations)
    .set({ revokedAt: inv.revokedAt ?? new Date() })
    .where(eq(invitations.id, id))
    .returning();
  return c.json({ invitation: toInvitation(updated!) });
});
