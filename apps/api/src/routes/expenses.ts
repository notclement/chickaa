import {
  CreateExpenseRequest,
  DeleteTripRequest,
  SetTripFxRateRequest,
  UpdateExpenseRequest,
  type BalancesResponse,
  type Expense,
  type ExpenseListResponse,
  type ExpenseRevisionsResponse,
  type FxRateResponse,
  type RateChoice,
  type SplitRequest,
  type TripFxRatesResponse,
} from '@ncc/contracts';
import {
  buildExpense,
  computeBalances,
  FinanceError,
  isCurrencyCode,
  parseAmount,
  parsePercent,
  parseRate,
  rateFromLiteral,
  rateToString,
  type CurrencyCode,
  type SplitInput,
} from '@ncc/core';
import { schema, type Db } from '@ncc/db';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { z } from 'zod';
import { sha256 } from '../auth/crypto.ts';
import { currentUser, requireAuth } from '../auth/session.ts';
import { apiRate } from '../fx/rates.ts';
import { body, forbidden, HttpError, isUniqueViolation, notFound, uuidParam } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';
import { membership } from './trips.ts';

const { trips, tripMembers, users, expenses, expensePayers, expenseSplits, expenseRevisions, tripFxRates, settlements } = schema;

type ExpenseRow = typeof expenses.$inferSelect;
type TripRow = typeof trips.$inferSelect;
type Fields = Omit<z.output<typeof CreateExpenseRequest>, 'clientId'>;

const IsoDate = /^\d{4}-\d{2}-\d{2}$/;

// ---------- helpers ----------

function financeToHttp(err: unknown): never {
  if (err instanceof FinanceError) {
    throw new HttpError(400, 'VALIDATION', err.message, err.field ? { fields: { [err.field]: err.message } } : undefined);
  }
  throw err;
}

/** Key-sorted JSON so the same expense always hashes the same (idempotent retries). */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

async function memberIds(db: Db, tripId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: tripMembers.userId })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), isNull(tripMembers.leftAt)))
    .orderBy(asc(tripMembers.joinedAt), asc(tripMembers.userId));
  return rows.map((r) => r.userId);
}

interface RateDecision {
  rate: string;
  source: 'same_currency' | 'api' | 'trip_fixed' | 'manual';
  date: string;
}

async function tripFixedRate(db: Db, tripId: string, currency: string) {
  const [row] = await db
    .select()
    .from(tripFxRates)
    .where(and(eq(tripFxRates.tripId, tripId), eq(tripFxRates.currency, currency)))
    .limit(1);
  return row ? rateToString(rateFromLiteral(row.rate)) : null;
}

/** Decides the exchange rate for an expense. Network calls happen here, outside the DB transaction. */
async function decideRate(
  db: Db,
  fx: Env['Variables']['fx'],
  trip: TripRow,
  f: Fields,
  keep?: ExpenseRow,
): Promise<RateDecision> {
  if (f.currency === trip.baseCurrency) return { rate: '1', source: 'same_currency', date: f.expenseDate };
  const choice: RateChoice | undefined = f.rate;
  if (!choice) throw new HttpError(400, 'VALIDATION', 'Choose an exchange rate', { fields: { rate: 'Choose an exchange rate' } });

  // Editing an expense without changing currency/date/rate type keeps its original rate: historical
  // rates never change by themselves (SPEC §9).
  if (keep && keep.originalCurrency === f.currency && keep.expenseDate === f.expenseDate && keep.rateSource === choice.source && choice.source !== 'manual') {
    return { rate: rateToString(rateFromLiteral(keep.exchangeRate)), source: keep.rateSource, date: keep.rateDate };
  }

  switch (choice.source) {
    case 'manual':
      try {
        return { rate: rateToString(parseRate(choice.value)), source: 'manual', date: f.expenseDate };
      } catch (err) {
        if (err instanceof FinanceError) throw new HttpError(400, 'VALIDATION', err.message, { fields: { rate: err.message } });
        throw err;
      }
    case 'trip_fixed': {
      const r = await tripFixedRate(db, trip.id, f.currency);
      if (!r) throw new HttpError(400, 'VALIDATION', `This trip has no fixed rate for ${f.currency}`, { fields: { rate: 'No trip rate set' } });
      return { rate: r, source: 'trip_fixed', date: f.expenseDate };
    }
    case 'api': {
      const r = await apiRate(db, fx, f.currency, trip.baseCurrency, f.expenseDate);
      return { rate: r.rate, source: 'api', date: r.date };
    }
  }
}

function toSplitInput(split: SplitRequest, currency: CurrencyCode): SplitInput {
  switch (split.type) {
    case 'equal':
      return { type: 'equal', participants: split.participants };
    case 'exact':
      return { type: 'exact', amounts: split.amounts.map((a) => ({ userId: a.userId, amount: parseAmount(a.amount, currency) })) };
    case 'percentage':
      return { type: 'percentage', percents: split.percents.map((p) => ({ userId: p.userId, basisPoints: parsePercent(p.percent) })) };
    case 'shares':
      return { type: 'shares', shares: split.shares };
  }
}

function splitUserIds(split: SplitRequest): string[] {
  switch (split.type) {
    case 'equal':
      return split.participants;
    case 'exact':
      return split.amounts.map((a) => a.userId);
    case 'percentage':
      return split.percents.map((p) => p.userId);
    case 'shares':
      return split.shares.map((s) => s.userId);
  }
}

/** Validates and computes all amounts with the shared financial engine. */
function compute(trip: TripRow, f: Fields, rate: RateDecision, members: string[]) {
  if (!isCurrencyCode(trip.baseCurrency)) throw new HttpError(500, 'INTERNAL', 'Bad trip currency');
  const currency = f.currency as CurrencyCode;
  const everyone = new Set(members);
  for (const id of [...f.payers.map((p) => p.userId), ...splitUserIds(f.split)]) {
    if (!everyone.has(id)) throw new HttpError(400, 'VALIDATION', 'Everyone on an expense must be a member of the trip');
  }
  try {
    const total = parseAmount(f.amount, currency);
    const split = toSplitInput(f.split, currency);
    const built = buildExpense({
      total,
      currency,
      baseCurrency: trip.baseCurrency,
      rate: rate.rate,
      payers: f.payers.map((p) => ({ userId: p.userId, amount: parseAmount(p.amount, currency) })),
      split,
    });
    const inputs = new Map<string, { bp: number | null; shares: number | null; amount: bigint | null }>();
    if (split.type === 'percentage') split.percents.forEach((p) => inputs.set(p.userId, { bp: p.basisPoints, shares: null, amount: null }));
    if (split.type === 'shares') split.shares.forEach((s) => inputs.set(s.userId, { bp: null, shares: s.shares, amount: null }));
    if (split.type === 'exact') split.amounts.forEach((a) => inputs.set(a.userId, { bp: null, shares: null, amount: a.amount }));
    return { built, inputs };
  } catch (err) {
    financeToHttp(err);
  }
}

async function writeLines(tx: Db, expenseId: string, c: ReturnType<typeof compute>) {
  await tx.insert(expensePayers).values(c.built.payers.map((p) => ({ expenseId, userId: p.userId, amountOriginal: p.original, amountBase: p.base })));
  await tx.insert(expenseSplits).values(
    c.built.splits.map((s) => {
      const i = c.inputs.get(s.userId);
      return {
        expenseId,
        userId: s.userId,
        shareOriginal: s.original,
        shareBase: s.base,
        inputPercentageBp: i?.bp ?? null,
        inputShares: i?.shares ?? null,
        inputAmount: i?.amount ?? null,
      };
    }),
  );
}

export async function loadExpenses(db: Db, where: { tripId?: string; ids?: string[]; includeDeleted?: boolean }): Promise<Expense[]> {
  const conds = [];
  if (where.tripId) conds.push(eq(expenses.tripId, where.tripId));
  if (where.ids) conds.push(inArray(expenses.id, where.ids.length ? where.ids : ['00000000-0000-0000-0000-000000000000']));
  if (!where.includeDeleted) conds.push(isNull(expenses.deletedAt));
  const rows = await db
    .select()
    .from(expenses)
    .where(and(...conds))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [payers, splits] = await Promise.all([
    db.select().from(expensePayers).where(inArray(expensePayers.expenseId, ids)),
    db.select().from(expenseSplits).where(inArray(expenseSplits.expenseId, ids)),
  ]);
  return rows.map((e) => serialize(e, payers.filter((p) => p.expenseId === e.id), splits.filter((s) => s.expenseId === e.id)));
}

function serialize(
  e: ExpenseRow,
  payers: (typeof expensePayers.$inferSelect)[],
  splits: (typeof expenseSplits.$inferSelect)[],
): Expense {
  return {
    id: e.id,
    tripId: e.tripId,
    clientId: e.clientId,
    description: e.description,
    notes: e.notes,
    expenseDate: e.expenseDate,
    currency: e.originalCurrency,
    amount: e.originalAmount.toString(),
    baseCurrency: e.baseCurrency,
    baseAmount: e.baseAmount.toString(),
    rate: rateToString(rateFromLiteral(e.exchangeRate)),
    rateSource: e.rateSource,
    rateDate: e.rateDate,
    splitType: e.splitType,
    payers: payers.map((p) => ({ userId: p.userId, amount: p.amountOriginal.toString(), baseAmount: p.amountBase.toString() })),
    splits: splits.map((s) => ({
      userId: s.userId,
      amount: s.shareOriginal.toString(),
      baseAmount: s.shareBase.toString(),
      percentBp: s.inputPercentageBp,
      shares: s.inputShares,
    })),
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    version: e.version,
    deleted: !!e.deletedAt,
  };
}

async function lockTrip(tx: Db, tripId: string): Promise<TripRow> {
  const [t] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
  if (!t || t.deletedAt) throw notFound('Trip not found');
  if (t.status !== 'active') throw new HttpError(409, 'TRIP_LOCKED', 'This trip is completed. Ask the owner to reopen it to change expenses.');
  return t;
}

async function addRevision(tx: Db, expenseId: string, version: number, action: 'create' | 'update' | 'delete', actor: string) {
  const [e] = await loadExpenses(tx, { ids: [expenseId], includeDeleted: true });
  await tx.insert(expenseRevisions).values({ expenseId, version, action, snapshot: e as unknown as object, actorUserId: actor });
}

// ---------- trip-scoped routes: /trips/:id/... ----------

export const tripExpenseRoutes = new Hono<Env>();
tripExpenseRoutes.use('*', requireAuth);

tripExpenseRoutes.get('/:id/expenses', async (c) => {
  const me = currentUser(c);
  const tripId = uuidParam(c, 'id');
  await membership(c.var.db, tripId, me.id);
  const res: ExpenseListResponse = { expenses: await loadExpenses(c.var.db, { tripId }) };
  return c.json(res);
});

tripExpenseRoutes.post('/:id/expenses', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { trip } = await membership(db, tripId, me.id);
  const input = await body(c, CreateExpenseRequest);
  const { clientId, ...fields } = input;
  const payloadHash = sha256(stableStringify(fields));

  // Same clientId again (retry after a lost response): return what we already saved.
  const replay = async () => {
    const [existing] = await db.select().from(expenses).where(and(eq(expenses.tripId, tripId), eq(expenses.clientId, clientId)));
    if (!existing) return null;
    if (existing.payloadHash !== payloadHash) {
      throw new HttpError(409, 'CONFLICT', 'This expense was already saved with different details');
    }
    const [e] = await loadExpenses(db, { ids: [existing.id], includeDeleted: true });
    return c.json(e!, 200);
  };
  const early = await replay();
  if (early) return early;

  const rate = await decideRate(db, c.var.fx, trip, fields);

  try {
    const id = await db.transaction(async (tx) => {
      const t = await lockTrip(tx as unknown as Db, tripId);
      const computed = compute(t, fields, rate, await memberIds(tx as unknown as Db, tripId));
      const [row] = await tx
        .insert(expenses)
        .values({
          tripId,
          clientId,
          description: fields.description,
          notes: fields.notes || null,
          originalAmount: computed.built.total,
          originalCurrency: fields.currency,
          baseCurrency: t.baseCurrency,
          exchangeRate: computed.built.rate,
          rateSource: rate.source,
          rateDate: rate.date,
          baseAmount: computed.built.baseTotal,
          splitType: fields.split.type,
          expenseDate: fields.expenseDate,
          createdBy: me.id,
          payloadHash,
        })
        .returning({ id: expenses.id });
      await writeLines(tx as unknown as Db, row!.id, computed);
      await addRevision(tx as unknown as Db, row!.id, 1, 'create', me.id);
      return row!.id;
    });
    const [e] = await loadExpenses(db, { ids: [id] });
    return c.json(e!, 201);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const again = await replay();
      if (again) return again;
    }
    throw err;
  }
});

/** Current balances for a trip (non-deleted expenses + confirmed transfers). */
export async function tripBalances(db: Db, trip: TripRow): Promise<BalancesResponse> {
  const [list, members, transfers] = await Promise.all([
    loadExpenses(db, { tripId: trip.id }),
    memberIds(db, trip.id),
    db.select().from(settlements).where(and(eq(settlements.tripId, trip.id), eq(settlements.status, 'confirmed'))),
  ]);
  const { balances, totalSpent } = computeBalances({
    members,
    expenses: list.map((e) => ({
      payers: e.payers.map((p) => ({ userId: p.userId, base: BigInt(p.baseAmount) })),
      splits: e.splits.map((s) => ({ userId: s.userId, base: BigInt(s.baseAmount) })),
    })),
    transfers: transfers.map((t) => ({ fromUserId: t.fromUserId, toUserId: t.toUserId, amount: t.amount, status: t.status })),
  });
  return {
    baseCurrency: trip.baseCurrency,
    totalSpent: totalSpent.toString(),
    expenseCount: list.length,
    balances: balances.map((b) => ({
      userId: b.userId,
      paid: b.paid.toString(),
      share: b.share.toString(),
      transfersOut: b.transfersOut.toString(),
      transfersIn: b.transfersIn.toString(),
      net: b.net.toString(),
    })),
  };
}

tripExpenseRoutes.get('/:id/balances', async (c) => {
  const me = currentUser(c);
  const { trip } = await membership(c.var.db, uuidParam(c, 'id'), me.id);
  return c.json(await tripBalances(c.var.db, trip));
});

/**
 * Owner deletes a trip, only once everything is tallied up (every balance exactly zero) and no
 * transfer is half-way (sent but not confirmed, or disputed). Soft delete: hidden everywhere,
 * records kept for audit.
 */
tripExpenseRoutes.delete('/:id', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { trip, role } = await membership(db, tripId, me.id);
  if (role !== 'owner') throw forbidden('Only the trip creator can delete the trip');
  const { confirmName } = await body(c, DeleteTripRequest);
  if (confirmName.trim() !== trip.name.trim()) {
    throw new HttpError(400, 'VALIDATION', 'Type the trip name exactly to confirm', { fields: { confirmName: 'Doesn’t match the trip name' } });
  }

  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(trips).where(eq(trips.id, tripId)).for('update');
    if (!t || t.deletedAt) throw notFound('Trip not found');
    const b = await tripBalances(tx as unknown as Db, t);
    const open = b.balances.filter((r) => r.net !== '0');
    if (open.length) {
      throw new HttpError(409, 'TRIP_NOT_SETTLED', 'Everyone must be settled up (all balances at zero) before the trip can be deleted', {
        balances: open,
      });
    }
    const inFlight = await tx
      .select({ id: settlements.id })
      .from(settlements)
      .where(and(eq(settlements.tripId, tripId), inArray(settlements.status, ['sent', 'disputed'])))
      .limit(1);
    if (inFlight.length) throw new HttpError(409, 'TRIP_NOT_SETTLED', 'A transfer is still waiting to be confirmed');
    await tx.update(trips).set({ deletedAt: new Date(), deletedBy: me.id, updatedAt: new Date() }).where(eq(trips.id, tripId));
    await tx
      .update(schema.invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.invitations.tripId, tripId), isNull(schema.invitations.revokedAt)));
  });
  return c.json({ ok: true });
});

/** Suggested rate for the add-expense form: the trip's fixed rate if set, else the daily API rate. */
tripExpenseRoutes.get('/:id/fx-rate', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { trip } = await membership(db, tripId, me.id);
  const currency = (c.req.query('currency') ?? '').toUpperCase();
  const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
  if (!isCurrencyCode(currency) || !IsoDate.test(date)) throw new HttpError(400, 'VALIDATION', 'Bad currency or date');
  let res: FxRateResponse;
  if (currency === trip.baseCurrency) {
    res = { from: currency, to: trip.baseCurrency, rate: '1', date, source: 'same_currency', provider: null };
  } else {
    const fixed = await tripFixedRate(db, tripId, currency);
    if (fixed) res = { from: currency, to: trip.baseCurrency, rate: fixed, date, source: 'trip_fixed', provider: null };
    else {
      const r = await apiRate(db, c.var.fx, currency, trip.baseCurrency, date);
      res = { from: currency, to: trip.baseCurrency, rate: r.rate, date: r.date, source: 'api', provider: r.provider };
    }
  }
  return c.json(res);
});

tripExpenseRoutes.get('/:id/fx-rates', async (c) => {
  const me = currentUser(c);
  const tripId = uuidParam(c, 'id');
  await membership(c.var.db, tripId, me.id);
  const rows = await c.var.db.select().from(tripFxRates).where(eq(tripFxRates.tripId, tripId)).orderBy(asc(tripFxRates.currency));
  const res: TripFxRatesResponse = {
    rates: rows.map((r) => ({ currency: r.currency, rate: rateToString(rateFromLiteral(r.rate)), setAt: r.setAt.toISOString(), setBy: r.setBy })),
  };
  return c.json(res);
});

/** Owner fixes a rate for the whole trip (e.g. the rate you actually got at the money changer). */
tripExpenseRoutes.put('/:id/fx-rates/:currency', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const tripId = uuidParam(c, 'id');
  const { trip, role } = await membership(db, tripId, me.id);
  if (role !== 'owner') throw forbidden('Only the trip owner can set trip exchange rates');
  const currency = c.req.param('currency').toUpperCase();
  if (!isCurrencyCode(currency) || currency === trip.baseCurrency) throw new HttpError(400, 'VALIDATION', 'Pick a currency other than the trip’s');
  const { rate } = await body(c, SetTripFxRateRequest);
  let value: string;
  try {
    value = rateToString(parseRate(rate));
  } catch (err) {
    financeToHttp(err);
  }
  await db
    .insert(tripFxRates)
    .values({ tripId, currency, rate: value, setBy: me.id })
    .onConflictDoUpdate({ target: [tripFxRates.tripId, tripFxRates.currency], set: { rate: value, setBy: me.id, setAt: new Date() } });
  return c.json({ currency, rate: value });
});

tripExpenseRoutes.delete('/:id/fx-rates/:currency', async (c) => {
  const me = currentUser(c);
  const tripId = uuidParam(c, 'id');
  const { role } = await membership(c.var.db, tripId, me.id);
  if (role !== 'owner') throw forbidden('Only the trip owner can change trip exchange rates');
  await c.var.db
    .delete(tripFxRates)
    .where(and(eq(tripFxRates.tripId, tripId), eq(tripFxRates.currency, c.req.param('currency').toUpperCase())));
  return c.json({ ok: true });
});

// ---------- expense routes: /expenses/:id ----------

export const expenseRoutes = new Hono<Env>();
expenseRoutes.use('*', requireAuth);

async function expenseForMember(db: Db, id: string, userId: string) {
  const [e] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!e) throw notFound('Expense not found');
  const m = await membership(db, e.tripId, userId);
  return { expense: e, ...m };
}

function canEdit(e: ExpenseRow, role: 'owner' | 'member', userId: string) {
  return role === 'owner' || e.createdBy === userId;
}

expenseRoutes.get('/:id', async (c) => {
  const me = currentUser(c);
  const id = uuidParam(c, 'id');
  await expenseForMember(c.var.db, id, me.id);
  const [e] = await loadExpenses(c.var.db, { ids: [id], includeDeleted: true });
  return c.json(e!);
});

expenseRoutes.put('/:id', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const id = uuidParam(c, 'id');
  const { expense, trip, role } = await expenseForMember(db, id, me.id);
  if (!canEdit(expense, role, me.id)) throw forbidden('Only whoever added this expense, or the trip owner, can change it');
  if (expense.deletedAt) throw new HttpError(410, 'NOT_FOUND', 'This expense was deleted');
  const { version, ...fields } = await body(c, UpdateExpenseRequest);
  const rate = await decideRate(db, c.var.fx, trip, fields, expense);

  await db.transaction(async (tx) => {
    const t = await lockTrip(tx as unknown as Db, expense.tripId);
    const [cur] = await tx.select().from(expenses).where(eq(expenses.id, id)).for('update');
    if (!cur || cur.deletedAt) throw new HttpError(410, 'NOT_FOUND', 'This expense was deleted');
    if (cur.version !== version) {
      const [current] = await loadExpenses(tx as unknown as Db, { ids: [id] });
      throw new HttpError(409, 'CONFLICT', 'Someone changed this expense while you were editing it', { current });
    }
    const computed = compute(t, fields, rate, await memberIds(tx as unknown as Db, expense.tripId));
    await tx.delete(expensePayers).where(eq(expensePayers.expenseId, id));
    await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, id));
    await tx
      .update(expenses)
      .set({
        description: fields.description,
        notes: fields.notes || null,
        originalAmount: computed.built.total,
        originalCurrency: fields.currency,
        exchangeRate: computed.built.rate,
        rateSource: rate.source,
        rateDate: rate.date,
        baseAmount: computed.built.baseTotal,
        splitType: fields.split.type,
        expenseDate: fields.expenseDate,
        payloadHash: sha256(stableStringify(fields)),
        version: sql`${expenses.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, id));
    await writeLines(tx as unknown as Db, id, computed);
    await addRevision(tx as unknown as Db, id, version + 1, 'update', me.id);
  });
  const [e] = await loadExpenses(db, { ids: [id] });
  return c.json(e!);
});

expenseRoutes.delete('/:id', async (c) => {
  const me = currentUser(c);
  const db = c.var.db;
  const id = uuidParam(c, 'id');
  const version = Number(c.req.query('version'));
  if (!Number.isInteger(version) || version < 1) throw new HttpError(400, 'VALIDATION', 'Missing version');
  const { expense, role } = await expenseForMember(db, id, me.id);
  if (!canEdit(expense, role, me.id)) throw forbidden('Only whoever added this expense, or the trip owner, can delete it');

  await db.transaction(async (tx) => {
    await lockTrip(tx as unknown as Db, expense.tripId);
    const [cur] = await tx.select().from(expenses).where(eq(expenses.id, id)).for('update');
    if (!cur || cur.deletedAt) throw new HttpError(410, 'NOT_FOUND', 'This expense was already deleted');
    if (cur.version !== version) {
      const [current] = await loadExpenses(tx as unknown as Db, { ids: [id] });
      throw new HttpError(409, 'CONFLICT', 'Someone changed this expense while you were looking at it', { current });
    }
    // Soft delete: history (and the revision trail) stays.
    await tx
      .update(expenses)
      .set({ deletedAt: new Date(), deletedBy: me.id, version: sql`${expenses.version} + 1`, updatedAt: new Date() })
      .where(eq(expenses.id, id));
    await addRevision(tx as unknown as Db, id, version + 1, 'delete', me.id);
  });
  return c.json({ ok: true });
});

expenseRoutes.get('/:id/revisions', async (c) => {
  const me = currentUser(c);
  const id = uuidParam(c, 'id');
  await expenseForMember(c.var.db, id, me.id);
  const rows = await c.var.db
    .select({ r: expenseRevisions, name: users.displayName })
    .from(expenseRevisions)
    .innerJoin(users, eq(users.id, expenseRevisions.actorUserId))
    .where(eq(expenseRevisions.expenseId, id))
    .orderBy(asc(expenseRevisions.version));
  const res: ExpenseRevisionsResponse = {
    revisions: rows.map(({ r, name }) => ({
      version: r.version,
      action: r.action,
      actor: { userId: r.actorUserId, displayName: name },
      createdAt: r.createdAt.toISOString(),
      snapshot: r.snapshot,
    })),
  };
  return c.json(res);
});
