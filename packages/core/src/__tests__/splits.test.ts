import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeSplit, FinanceError, type SplitInput } from '../index.ts';

const total = (rows: { amount: bigint }[]) => rows.reduce((a, r) => a + r.amount, 0n);
const asMap = (rows: { userId: string; amount: bigint }[]) => Object.fromEntries(rows.map((r) => [r.userId, r.amount]));

describe('equal split', () => {
  it('divides evenly', () => {
    expect(asMap(computeSplit(30000n, { type: 'equal', participants: ['a', 'b', 'c', 'd'] }))).toEqual({ a: 7500n, b: 7500n, c: 7500n, d: 7500n });
  });

  it('handles rounding deterministically: leftover cents go to the first participants listed', () => {
    expect(asMap(computeSplit(10000n, { type: 'equal', participants: ['a', 'b', 'c'] }))).toEqual({ a: 3334n, b: 3333n, c: 3333n });
    expect(asMap(computeSplit(10001n, { type: 'equal', participants: ['a', 'b', 'c'] }))).toEqual({ a: 3334n, b: 3334n, c: 3333n });
  });

  it('requires at least one participant and no duplicates', () => {
    expect(() => computeSplit(100n, { type: 'equal', participants: [] })).toThrow(FinanceError);
    expect(() => computeSplit(100n, { type: 'equal', participants: ['a', 'a'] })).toThrow(/twice/);
  });
});

describe('exact amounts split (also covers “unequal”)', () => {
  it('uses the amounts as given', () => {
    const rows = computeSplit(5000n, { type: 'exact', amounts: [{ userId: 'a', amount: 3000n }, { userId: 'b', amount: 2000n }] });
    expect(asMap(rows)).toEqual({ a: 3000n, b: 2000n });
  });

  it('must add up to the total exactly', () => {
    expect(() => computeSplit(5000n, { type: 'exact', amounts: [{ userId: 'a', amount: 3000n }, { userId: 'b', amount: 1999n }] })).toThrow(
      /add up/,
    );
    expect(() => computeSplit(5000n, { type: 'exact', amounts: [{ userId: 'a', amount: 6000n }, { userId: 'b', amount: -1000n }] })).toThrow(
      FinanceError,
    );
  });
});

describe('percentage split', () => {
  it('splits by percentage (basis points, so 33.33% is possible)', () => {
    const rows = computeSplit(10000n, {
      type: 'percentage',
      percents: [
        { userId: 'a', basisPoints: 5000 },
        { userId: 'b', basisPoints: 3333 },
        { userId: 'c', basisPoints: 1667 },
      ],
    });
    expect(asMap(rows)).toEqual({ a: 5000n, b: 3333n, c: 1667n });
  });

  it('rounds without losing a cent', () => {
    const rows = computeSplit(1001n, {
      type: 'percentage',
      percents: [
        { userId: 'a', basisPoints: 3333 },
        { userId: 'b', basisPoints: 3333 },
        { userId: 'c', basisPoints: 3334 },
      ],
    });
    expect(total(rows)).toBe(1001n);
  });

  it('must total exactly 100%', () => {
    expect(() =>
      computeSplit(100n, { type: 'percentage', percents: [{ userId: 'a', basisPoints: 5000 }, { userId: 'b', basisPoints: 4999 }] }),
    ).toThrow(/100%/);
    expect(() => computeSplit(100n, { type: 'percentage', percents: [{ userId: 'a', basisPoints: 10000.5 }] })).toThrow(FinanceError);
  });
});

describe('shares split', () => {
  it('spec example: Alice 2 shares, Bob 1, Charlie 1', () => {
    const rows = computeSplit(40000n, {
      type: 'shares',
      shares: [
        { userId: 'alice', shares: 2 },
        { userId: 'bob', shares: 1 },
        { userId: 'charlie', shares: 1 },
      ],
    });
    expect(asMap(rows)).toEqual({ alice: 20000n, bob: 10000n, charlie: 10000n });
  });

  it('rejects zero, negative or fractional shares', () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() => computeSplit(100n, { type: 'shares', shares: [{ userId: 'a', shares: bad }] })).toThrow(FinanceError);
    }
  });
});

describe('every split method', () => {
  it('rejects a zero or negative total', () => {
    expect(() => computeSplit(0n, { type: 'equal', participants: ['a'] })).toThrow(FinanceError);
  });

  const ids = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 20 });

  it('PROPERTY: shares always add up exactly to the expense total', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        ids,
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 20, maxLength: 20 }),
        (t, people, weights) => {
          const inputs: SplitInput[] = [
            { type: 'equal', participants: people },
            { type: 'shares', shares: people.map((p, i) => ({ userId: p, shares: weights[i]! })) },
          ];
          // A valid percentage split: give everything but the last person 0.01% each.
          if (people.length <= 100) {
            const bps = people.map((_, i) => (i === people.length - 1 ? 10000 - (people.length - 1) : 1));
            inputs.push({ type: 'percentage', percents: people.map((p, i) => ({ userId: p, basisPoints: bps[i]! })) });
          }
          for (const input of inputs) {
            const rows = computeSplit(t, input);
            expect(total(rows)).toBe(t);
            expect(rows.map((r) => r.userId)).toEqual(people);
            expect(rows.every((r) => r.amount >= 0n)).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
