import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildExpense, FinanceError } from '../index.ts';

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe('buildExpense: one expense → exact original + base-currency amounts', () => {
  it('spec example: SGD 300, Alice paid 200, Bob paid 100, 4 share equally', () => {
    const e = buildExpense({
      total: 30000n,
      currency: 'SGD',
      baseCurrency: 'SGD',
      rate: '1',
      payers: [
        { userId: 'alice', amount: 20000n },
        { userId: 'bob', amount: 10000n },
      ],
      split: { type: 'equal', participants: ['alice', 'bob', 'charlie', 'david'] },
    });
    expect(e.baseTotal).toBe(30000n);
    expect(e.payers).toEqual([
      { userId: 'alice', original: 20000n, base: 20000n },
      { userId: 'bob', original: 10000n, base: 10000n },
    ]);
    expect(e.splits.map((s) => s.base)).toEqual([7500n, 7500n, 7500n, 7500n]);
  });

  it('converts a foreign-currency expense and keeps payers + splits reconciled to the cent', () => {
    // Hotel 12,000 THB at 0.0375 → 450.00 SGD; split 3 ways.
    const e = buildExpense({
      total: 1_200_000n,
      currency: 'THB',
      baseCurrency: 'SGD',
      rate: '0.0375',
      payers: [{ userId: 'a', amount: 1_200_000n }],
      split: { type: 'equal', participants: ['a', 'b', 'c'] },
    });
    expect(e.baseTotal).toBe(45_000n);
    expect(e.splits.map((s) => s.original)).toEqual([400_000n, 400_000n, 400_000n]);
    expect(e.splits.map((s) => s.base)).toEqual([15_000n, 15_000n, 15_000n]);
    expect(e.rate).toBe('0.0375');
  });

  it('allocates base cents proportionally instead of converting each share separately (no drift)', () => {
    // 100 IDR × 3 people at 0.0000845: converting each 33.33 IDR separately would give 0+0+0 SGD.
    const e = buildExpense({
      total: 1_000_000n,
      currency: 'IDR',
      baseCurrency: 'SGD',
      rate: '0.0000845',
      payers: [
        { userId: 'a', amount: 333_333n },
        { userId: 'b', amount: 666_667n },
      ],
      split: { type: 'equal', participants: ['a', 'b', 'c'] },
    });
    expect(e.baseTotal).toBe(8_450n); // 84.50 SGD
    expect(sum(e.payers.map((p) => p.base))).toBe(e.baseTotal);
    expect(sum(e.splits.map((s) => s.base))).toBe(e.baseTotal);
  });

  it('payers must add up to the total', () => {
    expect(() =>
      buildExpense({
        total: 10000n,
        currency: 'SGD',
        baseCurrency: 'SGD',
        rate: '1',
        payers: [{ userId: 'a', amount: 9999n }],
        split: { type: 'equal', participants: ['a'] },
      }),
    ).toThrow(/paid/);
  });

  it('validates payers', () => {
    const base = { total: 100n, currency: 'SGD' as const, baseCurrency: 'SGD' as const, rate: '1', split: { type: 'equal' as const, participants: ['a'] } };
    expect(() => buildExpense({ ...base, payers: [] })).toThrow(FinanceError);
    expect(() => buildExpense({ ...base, payers: [{ userId: 'a', amount: 50n }, { userId: 'a', amount: 50n }] })).toThrow(/twice/);
    expect(() => buildExpense({ ...base, payers: [{ userId: 'a', amount: 0n }, { userId: 'b', amount: 100n }] })).toThrow(FinanceError);
  });

  it('same-currency expenses must use rate 1', () => {
    expect(() =>
      buildExpense({ total: 100n, currency: 'SGD', baseCurrency: 'SGD', rate: '1.1', payers: [{ userId: 'a', amount: 100n }], split: { type: 'equal', participants: ['a'] } }),
    ).toThrow(/rate/);
  });

  it('refuses an amount that rounds to nothing in the base currency', () => {
    expect(() =>
      buildExpense({ total: 10n, currency: 'IDR', baseCurrency: 'SGD', rate: '0.0000845', payers: [{ userId: 'a', amount: 10n }], split: { type: 'equal', participants: ['a'] } }),
    ).toThrow(/too small/);
  });

  it('PROPERTY: for any currency pair, rate, payers and split, everything reconciles exactly', () => {
    const people = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
    fc.assert(
      fc.property(
        fc.bigInt({ min: 100_000n, max: 10n ** 12n }),
        fc.constantFrom(['THB', '0.0375'], ['IDR', '0.0000845'], ['JPY', '0.0089'], ['USD', '1.345'], ['MYR', '0.29']),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 6, maxLength: 6 }),
        (t, [cur, rate], nPayers, nSplit, weights) => {
          const payerIds = people.slice(0, nPayers);
          const payerAmounts = buildPayerAmounts(t, nPayers);
          const e = buildExpense({
            total: t,
            currency: cur as 'THB',
            baseCurrency: 'SGD',
            rate: rate!,
            payers: payerIds.map((u, i) => ({ userId: u, amount: payerAmounts[i]! })),
            split: { type: 'shares', shares: people.slice(0, nSplit).map((u, i) => ({ userId: u, shares: weights[i]! })) },
          });
          expect(sum(e.payers.map((p) => p.original))).toBe(t);
          expect(sum(e.splits.map((s) => s.original))).toBe(t);
          expect(sum(e.payers.map((p) => p.base))).toBe(e.baseTotal);
          expect(sum(e.splits.map((s) => s.base))).toBe(e.baseTotal);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

function buildPayerAmounts(total: bigint, n: number): bigint[] {
  const each = total / BigInt(n);
  const out = Array.from({ length: n }, () => each);
  out[0]! += total - each * BigInt(n);
  return out;
}
