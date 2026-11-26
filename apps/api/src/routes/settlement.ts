import { SUPPORT_TELEGRAM, type BalancesResponse, type SettlementResponse } from '@ncc/contracts';
import { planSettlement, verifySettlement } from '@ncc/core';
import { schema, type Db } from '@ncc/db';
import { and, asc, eq, inArray, isNotNull, isNull, max } from 'drizzle-orm';
import { Hono } from 'hono';
import { currentUser, requireAuth } from '../auth/session.ts';
import { forbidden, HttpError, notFound, uuidParam } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';
import { tripBalances } from './expenses.ts';
import { membership, viewAccess } from './trips.ts';

const { trips, settlementPlans, settlements, settlementEvents, tripMembers, users } = schema;
type TripRow = typeof trips.$inferSelect;

type SettlementRow = typeof settlements.$inferSelect;
const toTransfer = (r: SettlementRow) => ({
  id: r.id,
  fromUserId: r.fromUserId,
  toUserId: r.toUserId,
  amount: r.amount.toString(),
  currency: r.currency,
  status: r.status,
  settledOutside: r.settledOutside,
  updatedAt: r.updatedAt.toISOString(),
});

/** Confirmed payments from plans that were replaced by a reopen (test report B3). */
async function earlierPayments(db: Db, tripId: string) {
  const rows = await db
    .select({ s: settlements })
    .from(settlements)
    .innerJoin(settlementPlans, eq(settlementPlans.id, settlements.planId))
    .where(and(eq(settlements.tripId, tripId), isNotNull(settlementPlans.supersededAt), eq(settlements.status, 'confirmed')))
    .orderBy(asc(settlementPlans.version), asc(settlements.position));
  return rows.map((r) => toTransfer(r.s));
}

function plan(b: BalancesResponse) {
  return planSettlement(b.balances.map((r) => ({ userId: r.userId, net: BigInt(r.net) })));
}

/** Stored plan (completed trip) or a live preview (active trip). */
export async function settlementView(db: Db, trip: TripRow): Promise<SettlementResponse> {
  const balances = await tripBalances(db, trip);
  const allZero = balances.balances.every((b) => b.net === '0');
  const earlier = await earlierPayments(db, trip.id);

  if (trip.status === 'active') {
    const p = plan(balances);
    return {
      state: 'preview',
      planVersion: null,
      algorithm: p.algorithm,
      provenOptimal: p.provenOptimal,
      nonZeroCount: p.nonZeroCount,
      baseCurrency: trip.baseCurrency,
      transfers: p.transfers.map((t) => ({
        id: null,
        fromUserId: t.from,
        toUserId: t.to,
        amount: t.amount.toString(),
        currency: trip.baseCurrency,
        status: 'pending',
        settledOutside: false,
        updatedAt: null,
      })),
      earlier,
      progress: { confirmed: 0, total: p.transfers.length, fullySettled: false },
    };
  }

  const [current] = await db
    .select()
    .from(settlementPlans)
    .where(and(eq(settlementPlans.tripId, trip.id), isNull(settlementPlans.supersededAt)))
    .limit(1);
  if (!current) throw new HttpError(500, 'INTERNAL', 'Completed trip has no settlement plan');
  const rows = await db.select().from(settlements).where(eq(settlements.planId, current.id)).orderBy(asc(settlements.position), asc(settlements.id));
  const live = rows.filter((r) => r.status !== 'cancelled');
  const confirmed = live.filter((r) => r.status === 'confirmed').length;
  return {
    state: 'plan',
    planVersion: current.version,
    algorithm: current.algorithm,
    provenOptimal: current.isProvenOptimal,
    nonZeroCount: (current.balancesSnapshot as { nonZeroCount?: number }).nonZeroCount ?? live.length,
    baseCurrency: trip.baseCurrency,
    transfers: rows.map(toTransfer),
    earlier,
    // Fully settled = every transfer confirmed by its recipient AND every balance at zero.
    // Generating a plan alone never counts (SPEC §13).
    progress: { confirmed, total: live.length, fullySettled: confirmed === live.length && allZero },
  };
}

export const settlementRoutes = new Hono<Env>();
settlementRoutes.use('*', requireAuth);

settlementRoutes.get('/:id/settlement', async (c) => {
  const me = currentUser(c);
  const { trip } = await viewAccess(c.var.db, uuidParam(c, 'id'), me);
  return c.json(await settlementView(c.var.db, trip));
});

/** Owner finishes the trip: expenses lock and the minimum-transfer plan is stored. */
settlementRoutes.post('/:id/complete', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { role } = await membership(db, tripId, me.id);
  if (role !== 'owner') throw forbidden('Only the trip creator can finish the trip');

  const trip = await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [row] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
    if (!row || row.deletedAt) throw notFound('Trip not found');
    if (row.status !== 'active') throw new HttpError(409, 'TRIP_LOCKED', 'This trip is already finished');

    const balances = await tripBalances(t, row);
    const p = plan(balances);
    // Financial integrity: independently re-check the plan settles every balance to the cent.
    const nets = balances.balances.map((r) => ({ userId: r.userId, net: BigInt(r.net) }));
    if (!verifySettlement(nets, p.transfers)) throw new HttpError(500, 'INTERNAL', 'Settlement plan failed its integrity check');
    const [{ v } = { v: 0 }] = await tx.select({ v: max(settlementPlans.version) }).from(settlementPlans).where(eq(settlementPlans.tripId, tripId));
    const [stored] = await tx
      .insert(settlementPlans)
      .values({
        tripId,
        version: (v ?? 0) + 1,
        algorithm: p.algorithm,
        isProvenOptimal: p.provenOptimal,
        transferCount: p.transfers.length,
        balancesSnapshot: { balances: balances.balances, nonZeroCount: p.nonZeroCount },
        createdBy: me.id,
      })
      .returning();
    if (p.transfers.length) {
      const inserted = await tx
        .insert(settlements)
        .values(
          p.transfers.map((x, position) => ({
            position,
            planId: stored!.id,
            tripId,
            fromUserId: x.from,
            toUserId: x.to,
            amount: x.amount,
            currency: row.baseCurrency,
          })),
        )
        .returning({ id: settlements.id });
      await tx.insert(settlementEvents).values(inserted.map((s) => ({ settlementId: s.id, actorUserId: me.id, fromStatus: null, toStatus: 'pending' as const })));
    }
    const [updated] = await tx
      .update(trips)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(trips.id, tripId))
      .returning();
    return updated!;
  });
  return c.json(await settlementView(db, trip));
});

/**
 * Owner reopens a finished trip (e.g. someone forgot an expense). Not allowed while a transfer is
 * sent-but-unconfirmed or disputed. Pending transfers are cancelled; confirmed ones stay and keep
 * counting in balances, so the next plan only covers what's left.
 */
settlementRoutes.post('/:id/reopen', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { role } = await membership(db, tripId, me.id);
  if (role !== 'owner') throw forbidden('Only the trip creator can reopen the trip');
  const off = await db
    .select({ displayName: users.displayName, username: users.username })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(and(eq(tripMembers.tripId, tripId), isNull(tripMembers.leftAt), isNotNull(users.disabledAt)));
  if (off.length) {
    const who = off.map((u) => `${u.displayName} (@${u.username})`).join(', ');
    throw new HttpError(
      409,
      'MEMBER_DISABLED',
      `This trip can’t be reopened because ${who} ${off.length === 1 ? 'has a disabled account' : 'have disabled accounts'}. PM @${SUPPORT_TELEGRAM} on Telegram for more info.`,
      { members: off },
    );
  }

  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
    if (!row || row.deletedAt) throw notFound('Trip not found');
    if (row.status !== 'completed') throw new HttpError(409, 'TRIP_LOCKED', 'Only finished trips can be reopened');
    const [current] = await tx
      .select()
      .from(settlementPlans)
      .where(and(eq(settlementPlans.tripId, tripId), isNull(settlementPlans.supersededAt)));
    if (current) {
      const inFlight = await tx
        .select({ id: settlements.id })
        .from(settlements)
        .where(and(eq(settlements.planId, current.id), inArray(settlements.status, ['sent', 'disputed'])))
        .limit(1);
      if (inFlight.length) {
        throw new HttpError(409, 'TRANSFER_IN_FLIGHT', 'A transfer has been sent but not confirmed yet. Sort that out first.');
      }
      const pending = await tx
        .update(settlements)
        .set({ status: 'cancelled', version: 2, updatedAt: new Date() })
        .where(and(eq(settlements.planId, current.id), eq(settlements.status, 'pending')))
        .returning({ id: settlements.id });
      if (pending.length) {
        await tx
          .insert(settlementEvents)
          .values(pending.map((s) => ({ settlementId: s.id, actorUserId: me.id, fromStatus: 'pending' as const, toStatus: 'cancelled' as const, note: 'Trip reopened' })));
      }
      await tx.update(settlementPlans).set({ supersededAt: new Date() }).where(eq(settlementPlans.id, current.id));
    }
    await tx.update(trips).set({ status: 'active', completedAt: null, updatedAt: new Date() }).where(eq(trips.id, tripId));
  });
  const { trip } = await membership(db, tripId, me.id);
  return c.json(await settlementView(db, trip));
});

// ---------- Phase 6: tracking transfers made in people's own banking apps ----------

type Status = 'pending' | 'sent' | 'confirmed' | 'disputed' | 'cancelled';
type Action = 'sent' | 'confirm' | 'dispute' | 'settle-outside';

/**
 * Who may move a transfer from which status to which (SPEC §13):
 *   sent     — the payer, from pending or disputed (re-sent after a dispute)
 *   confirm  — ONLY the recipient, from sent, pending (cash) or disputed (money turned up after all)
 *   dispute  — the recipient, from sent ("I haven't received it")
 *   settle-outside — the trip owner: "settled another way" (cash, offset…). Counts as confirmed, so
 *              the trip can reach All settled (test report B1). Replaces the old "cancel".
 * Confirmed is final. ("cancelled" is only used internally when a trip is reopened.)
 */
const RULES: Record<Action, { to: Status; from: Status[]; who: 'payer' | 'recipient' | 'owner' }> = {
  sent: { to: 'sent', from: ['pending', 'disputed'], who: 'payer' },
  confirm: { to: 'confirmed', from: ['sent', 'pending', 'disputed'], who: 'recipient' },
  dispute: { to: 'disputed', from: ['sent'], who: 'recipient' },
  'settle-outside': { to: 'confirmed', from: ['pending', 'sent', 'disputed'], who: 'owner' },
};

const WHO_MSG = {
  payer: 'Only the person paying can mark this as sent',
  recipient: 'Only the person receiving the money can do that',
  owner: 'Only the trip creator can mark a transfer as settled another way',
} as const;

export const transferRoutes = new Hono<Env>();
transferRoutes.use('*', requireAuth);

for (const action of Object.keys(RULES) as Action[]) {
  transferRoutes.post(`/:id/${action}`, async (c) => {
    const me = currentUser(c);
    const db = c.var.db;
    const id = uuidParam(c, 'id');
    const rule = RULES[action];
    let note: string | null = null;
    if (action === 'dispute' || action === 'settle-outside') {
      const raw = (await c.req.json().catch(() => ({}))) as { note?: unknown };
      note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 300) || null : null;
      if (action === 'settle-outside') note = `Settled another way${note ? `: ${note}` : ''}`;
    }

    const [s0] = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1);
    if (!s0) throw notFound('Transfer not found');
    const { trip, role } = await membership(db, s0.tripId, me.id);

    await db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(eq(settlements.id, id)).for('update');
      if (!s) throw notFound('Transfer not found');
      const allowed = rule.who === 'payer' ? s.fromUserId === me.id : rule.who === 'recipient' ? s.toUserId === me.id : role === 'owner';
      if (!allowed) throw forbidden(WHO_MSG[rule.who]);
      if (s.status === rule.to && (action !== 'settle-outside' || s.settledOutside)) return; // already done: retrying is harmless
      const [p] = await tx.select().from(settlementPlans).where(eq(settlementPlans.id, s.planId));
      if (p?.supersededAt || trip.status !== 'completed') throw new HttpError(409, 'CONFLICT', 'This settle-up plan is no longer current');
      if (!rule.from.includes(s.status)) {
        const verb = { sent: 'mark as sent', confirm: 'confirm', dispute: 'dispute', 'settle-outside': 'mark as settled another way' }[action];
        throw new HttpError(409, 'CONFLICT', `Can’t ${verb} a transfer that is ${s.status}`);
      }
      await tx
        .update(settlements)
        .set({ status: rule.to, settledOutside: action === 'settle-outside', version: s.version + 1, updatedAt: new Date() })
        .where(eq(settlements.id, id));
      await tx.insert(settlementEvents).values({ settlementId: id, actorUserId: me.id, fromStatus: s.status, toStatus: rule.to, note });
    });
    const { trip: fresh } = await membership(db, s0.tripId, me.id);
    return c.json(await settlementView(db, fresh));
  });
}

transferRoutes.get('/:id/events', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const id = uuidParam(c, 'id');
  const [s] = await db.select().from(settlements).where(eq(settlements.id, id)).limit(1);
  if (!s) throw notFound('Transfer not found');
  await viewAccess(db, s.tripId, me);
  const rows = await db
    .select({ e: settlementEvents, name: schema.users.displayName })
    .from(settlementEvents)
    .innerJoin(schema.users, eq(schema.users.id, settlementEvents.actorUserId))
    .where(eq(settlementEvents.settlementId, id))
    .orderBy(asc(settlementEvents.createdAt));
  return c.json({
    events: rows.map(({ e, name }) => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: { userId: e.actorUserId, displayName: name },
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});
