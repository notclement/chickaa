import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocate, seedFrom } from '../index.ts';

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

describe('allocate (largest remainder)', () => {
  it('splits 100 three ways: extra cent goes to the first in order', () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
  });

  it('splits 200 three ways', () => {
    expect(allocate(200n, [1n, 1n, 1n])).toEqual([67n, 67n, 66n]);
  });

  it('gives leftovers to the largest fractional remainder first', () => {
    // 10 by 2:1:1 → 5, 2.5, 2.5 → 5, 3, 2 (tie on .5 → earlier wins)
    expect(allocate(10n, [2n, 1n, 1n])).toEqual([5n, 3n, 2n]);
    // 7 by 3:4 → 3, 4
    expect(allocate(7n, [3n, 4n])).toEqual([3n, 4n]);
    // 100 by 1:2 → 33.33, 66.67 → 33, 67 (bigger remainder wins, not first)
    expect(allocate(100n, [1n, 2n])).toEqual([33n, 67n]);
  });

  it('allows zero weights (they get nothing)', () => {
    expect(allocate(10n, [0n, 1n, 1n])).toEqual([0n, 5n, 5n]);
  });

  it('rejects invalid input', () => {
    expect(() => allocate(10n, [])).toThrow();
    expect(() => allocate(10n, [0n, 0n])).toThrow();
    expect(() => allocate(10n, [-1n, 2n])).toThrow();
    expect(() => allocate(-1n, [1n])).toThrow();
  });

  const weights = fc.array(fc.bigInt({ min: 0n, max: 10n ** 9n }), { minLength: 1, maxLength: 25 }).filter((w) => sum(w) > 0n);

  it('PROPERTY: parts always add up to exactly the total', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 15n }), weights, (total, w) => {
        expect(sum(allocate(total, w))).toBe(total);
      }),
      { numRuns: 2000 },
    );
  });

  it('PROPERTY: each part is within 1 unit of its exact proportional share', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), weights, (total, w) => {
        const W = sum(w);
        allocate(total, w).forEach((part, i) => {
          const exactTimesW = total * w[i]!; // exact share = exactTimesW / W
          expect(part * W >= exactTimesW - W).toBe(true);
          expect(part * W <= exactTimesW + W).toBe(true);
        });
      }),
    );
  });

  it('PROPERTY: deterministic (same input → same output)', () => {
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 9n }), weights, (t, w) => {
      expect(allocate(t, w)).toEqual(allocate(t, [...w]));
    }));
  });
});

describe('allocate: tie-break seed (test report run 3, F2)', () => {
  it('without a seed, ties go to the first position (unchanged)', () => {
    expect(allocate(1000n, [1n, 1n, 1n])).toEqual([334n, 333n, 333n]);
  });

  it('the seed picks where ties start, and is stable', () => {
    expect(allocate(1000n, [1n, 1n, 1n], 1)).toEqual([333n, 334n, 333n]);
    expect(allocate(1000n, [1n, 1n, 1n], 2)).toEqual([333n, 333n, 334n]);
    expect(allocate(1000n, [1n, 1n, 1n], 5)).toEqual(allocate(1000n, [1n, 1n, 1n], 2));
    expect(allocate(1001n, [1n, 1n, 1n], 2)).toEqual([334n, 333n, 334n]);
  });

  it('largest real remainder still wins over the seed', () => {
    // 10 split 1:2 → 3.33 / 6.67: the 2-weight part has the bigger remainder whatever the seed.
    for (let s = 0; s < 5; s++) expect(allocate(10n, [1n, 2n], s)).toEqual([3n, 7n]);
  });

  it('over many expenses the odd cents even out', () => {
    const got = [0n, 0n, 0n, 0n];
    for (let k = 0; k < 4000; k++) {
      const parts = allocate(1001n, [1n, 1n, 1n, 1n], seedFrom(`expense-${k}`));
      parts.forEach((p, i) => (got[i]! += p - 250n));
    }
    const max = got.reduce((a, b) => (a > b ? a : b));
    const min = got.reduce((a, b) => (a < b ? a : b));
    expect(Number(max - min)).toBeLessThan(150); // was 4000 vs 0 with first-person-first
  });

  it('seedFrom is a stable 32-bit number', () => {
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
    expect(seedFrom('abc')).not.toBe(seedFrom('abd'));
    expect(seedFrom('')).toBe(0x811c9dc5);
  });
});
