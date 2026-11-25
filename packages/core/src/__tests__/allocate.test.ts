import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { allocate } from '../index.ts';

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
