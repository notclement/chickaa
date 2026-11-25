import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildExpense, computeBalances, type LedgerExpense } from '../index.ts';

const ex = (payers: [string, bigint][], splits: [string, bigint][]): LedgerExpense => ({
  payers: payers.map(([userId, base]) => ({ userId, base })),
  splits: splits.map(([userId, base]) => ({ userId, base })),
});

describe('computeBalances: net = paid − share (+ confirmed transfers)', () => {
  it('spec example table', () => {
    // Alice paid 500 share 300 (+200), Bob 100/200 (−100), Charlie 0/150 (−150), David 50/0 (+50)
    const { balances, totalSpent } = computeBalances({
      members: ['alice', 'bob', 'charlie', 'david'],
      expenses: [
        ex([['alice', 50000n]], [['alice', 30000n], ['bob', 10000n], ['charlie', 10000n]]),
        ex([['bob', 10000n]], [['bob', 10000n]]),
        ex([['david', 5000n]], [['charlie', 5000n]]),
      ],
      transfers: [],
    });
    expect(Object.fromEntries(balances.map((b) => [b.userId, b.net]))).toEqual({ alice: 20000n, bob: -10000n, charlie: -15000n, david: 5000n });
    expect(balances.find((b) => b.userId === 'alice')).toMatchObject({ paid: 50000n, share: 30000n });
    expect(totalSpent).toBe(65000n);
  });

  it('includes members with no expenses at zero, in member order', () => {
    const { balances } = computeBalances({ members: ['x', 'y'], expenses: [], transfers: [] });
    expect(balances).toEqual([
      { userId: 'x', paid: 0n, share: 0n, transfersOut: 0n, transfersIn: 0n, net: 0n },
      { userId: 'y', paid: 0n, share: 0n, transfersOut: 0n, transfersIn: 0n, net: 0n },
    ]);
  });

  it('keeps people who appear in old expenses even if they are no longer members', () => {
    const { balances } = computeBalances({ members: ['a'], expenses: [ex([['a', 100n]], [['ghost', 100n]])], transfers: [] });
    expect(balances.map((b) => b.userId)).toEqual(['a', 'ghost']);
  });

  it('only CONFIRMED transfers move balances (sent / pending / disputed do not)', () => {
    const expenses = [ex([['alice', 10000n]], [['alice', 5000n], ['bob', 5000n]])];
    const base = { members: ['alice', 'bob'], expenses };
    for (const status of ['pending', 'sent', 'disputed', 'cancelled'] as const) {
      const { balances } = computeBalances({ ...base, transfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 5000n, status }] });
      expect(balances.map((b) => b.net)).toEqual([5000n, -5000n]);
    }
    const { balances } = computeBalances({ ...base, transfers: [{ fromUserId: 'bob', toUserId: 'alice', amount: 5000n, status: 'confirmed' }] });
    expect(balances.map((b) => b.net)).toEqual([0n, 0n]);
    expect(balances[1]).toMatchObject({ transfersOut: 5000n });
    expect(balances[0]).toMatchObject({ transfersIn: 5000n });
  });

  it('PROPERTY: balances always sum to exactly zero', () => {
    const people = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const expenseArb = fc.record({
      total: fc.bigInt({ min: 1000n, max: 10n ** 9n }),
      cur: fc.constantFrom(['SGD', '1'], ['IDR', '0.0000845'], ['THB', '0.0375'], ['JPY', '0.0089']),
      payer: fc.integer({ min: 0, max: 6 }),
      split: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 7 }),
    });
    fc.assert(
      fc.property(fc.array(expenseArb, { maxLength: 40 }), (rows) => {
        const expenses: LedgerExpense[] = [];
        for (const r of rows) {
          let total = r.total;
          if (r.cur[0] === 'IDR') total *= 1000n; // keep IDR amounts realistic (not rounding to zero SGD)
          const e = buildExpense({
            total,
            currency: r.cur[0] as 'SGD',
            baseCurrency: 'SGD',
            rate: r.cur[1]!,
            payers: [{ userId: people[r.payer]!, amount: total }],
            split: { type: 'equal', participants: r.split.map((i) => people[i]!) },
          });
          expenses.push({ payers: e.payers, splits: e.splits });
        }
        const { balances } = computeBalances({ members: people, expenses, transfers: [] });
        expect(balances.reduce((s, b) => s + b.net, 0n)).toBe(0n);
      }),
      { numRuns: 500 },
    );
  });

  it('throws if the input is internally inconsistent (an expense whose payers ≠ splits)', () => {
    expect(() => computeBalances({ members: ['a'], expenses: [ex([['a', 100n]], [['a', 99n]])], transfers: [] })).toThrow(/reconcile/);
  });
});
