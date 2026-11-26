import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EXACT_LIMIT, FinanceError, greedySettlement, planSettlement, verifySettlement, type NetBalance, type Transfer } from '../index.ts';

const B = (pairs: [string, number][]): NetBalance[] => pairs.map(([userId, n]) => ({ userId, net: BigInt(n) }));

/** Every debtor pays exactly what they owe, every creditor gets exactly what they're owed. */
function expectSettles(balances: NetBalance[], transfers: Transfer[]) {
  const left = new Map(balances.map((b) => [b.userId, b.net]));
  for (const t of transfers) {
    expect(t.amount > 0n).toBe(true);
    expect(t.from).not.toBe(t.to);
    expect(left.get(t.from)! < 0n).toBe(true); // money only flows from debtors…
    expect(left.get(t.to)! > 0n || balances.find((b) => b.userId === t.to)!.net > 0n).toBe(true); // …to creditors
    left.set(t.from, left.get(t.from)! + t.amount);
    left.set(t.to, left.get(t.to)! - t.amount);
  }
  for (const v of left.values()) expect(v).toBe(0n);
}

/** Independent brute force: minimum transfers = n − (max number of zero-sum groups), by trying every set partition. */
function bruteForceMin(nets: bigint[]): number {
  const xs = nets.filter((x) => x !== 0n);
  let best = 0;
  const rec = (i: number, groups: bigint[]) => {
    if (i === xs.length) {
      if (groups.every((g) => g === 0n)) best = Math.max(best, groups.length);
      return;
    }
    for (let g = 0; g < groups.length; g++) {
      groups[g]! += xs[i]!;
      rec(i + 1, groups);
      groups[g]! -= xs[i]!;
    }
    groups.push(xs[i]!);
    rec(i + 1, groups);
    groups.pop();
  };
  rec(0, []);
  return xs.length - best;
}

describe('planSettlement', () => {
  it('spec example: +300 +200 −250 −150 −100 → 4 transfers', () => {
    const balances = B([['alice', 300], ['bob', 200], ['charlie', -250], ['david', -150], ['eve', -100]]);
    const plan = planSettlement(balances);
    expect(plan.transfers).toHaveLength(4);
    expect(plan.provenOptimal).toBe(true);
    expect(plan.algorithm).toBe('exact_dp');
    expectSettles(balances, plan.transfers);
  });

  it('spec ledger example: +200 −100 −150 +50 → 3 transfers', () => {
    const balances = B([['alice', 200], ['bob', -100], ['charlie', -150], ['david', 50]]);
    const plan = planSettlement(balances);
    expect(plan.transfers).toHaveLength(3);
    expectSettles(balances, plan.transfers);
  });

  it('finds independent pairs: two couples settle in 2 transfers, not 3', () => {
    const balances = B([['a', 700], ['b', 500], ['c', -500], ['d', -700]]);
    const plan = planSettlement(balances);
    expect(plan.transfers).toEqual([
      { from: 'c', to: 'b', amount: 500n },
      { from: 'd', to: 'a', amount: 700n },
    ]);
  });

  it('beats the classic greedy on a known counterexample', () => {
    // Greedy (largest debtor → largest creditor) needs 4 here. Spotting the groups {+5 −3 −2} and {+4 −4}
    // settles it in 3.
    const balances = B([['a', 5], ['b', 4], ['c', -4], ['d', -3], ['e', -2]]);
    expect(greedySettlement(balances)).toHaveLength(4);
    const plan = planSettlement(balances);
    expect(plan.transfers).toHaveLength(3);
    expectSettles(balances, plan.transfers);
  });

  it('nothing to do when everyone is even', () => {
    expect(planSettlement(B([['a', 0], ['b', 0]])).transfers).toEqual([]);
    expect(planSettlement([]).transfers).toEqual([]);
  });

  it('refuses balances that do not sum to zero, or duplicates', () => {
    expect(() => planSettlement(B([['a', 5], ['b', -4]]))).toThrow(FinanceError);
    expect(() => planSettlement(B([['a', 5], ['a', -5]]))).toThrow(FinanceError);
  });

  it('is deterministic: same balances → identical plan', () => {
    const balances = B([['a', 30], ['b', 30], ['c', -20], ['d', -20], ['e', -20]]);
    expect(planSettlement(balances)).toEqual(planSettlement(balances.map((x) => ({ ...x }))));
  });

  it('PROPERTY: always a valid settlement, and exactly as short as brute force says is possible', () => {
    const nets = fc
      .array(fc.integer({ min: -40, max: 40 }), { minLength: 1, maxLength: 8 })
      .map((xs) => [...xs, -xs.reduce((a, b) => a + b, 0)]); // force sum zero
    fc.assert(
      fc.property(nets, (xs) => {
        const balances = xs.map((n, i) => ({ userId: `u${i}`, net: BigInt(n) }));
        const plan = planSettlement(balances);
        expectSettles(balances, plan.transfers);
        expect(plan.transfers.length).toBe(bruteForceMin(xs.map(BigInt)));
        expect(plan.provenOptimal).toBe(true);
      }),
      { numRuns: 1500 },
    );
  });

  it('PROPERTY: never worse than greedy, and strictly better on a noticeable share of random trips', () => {
    let better = 0;
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: 5, maxLength: 9 }), (xs) => {
        const all = [...xs, -xs.reduce((a, b) => a + b, 0)];
        const balances = all.map((n, i) => ({ userId: `u${i}`, net: BigInt(n) }));
        const g = greedySettlement(balances).length;
        const p = planSettlement(balances).transfers.length;
        expect(p).toBeLessThanOrEqual(g);
        if (p < g) better++;
      }),
      { numRuns: 1000, seed: 42 },
    );
    expect(better).toBeGreaterThan(10);
  });

  it(`exact for up to ${EXACT_LIMIT} people owing/owed, fast enough for a phone-sized request`, () => {
    // 20 non-zero balances with lots of small zero-sum groups hiding in them.
    const xs = [1500, -1500, 2300, -800, -1500, 999, -333, -666, 4200, -4200, 120, -60, -60, 777, -777, 5000, -2500, -2500, 10, -10];
    const balances = xs.map((n, i) => ({ userId: `u${i}`, net: BigInt(n) }));
    const t0 = performance.now();
    const plan = planSettlement(balances);
    const ms = performance.now() - t0;
    expect(plan.algorithm).toBe('exact_dp');
    expect(plan.provenOptimal).toBe(true);
    expect(plan.transfers.length).toBe(20 - 8); // 8 zero-sum groups
    expectSettles(balances, plan.transfers);
    expect(ms).toBeLessThan(3000);
  });

  it('larger groups fall back to a fast heuristic that is valid but not claimed optimal', () => {
    const xs = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 100 + i : -(100 + i - 1)));
    const balances = xs.map((n, i) => ({ userId: `u${i}`, net: BigInt(n) }));
    const plan = planSettlement(balances);
    expect(plan.algorithm).toBe('heuristic');
    expect(plan.provenOptimal).toBe(false);
    expectSettles(balances, plan.transfers);
    expect(plan.transfers.length).toBe(15); // the exact-pair pass still finds all 15 pairs
  });

  it('zero balances do not count towards the exact limit', () => {
    const balances = [
      ...Array.from({ length: 30 }, (_, i) => ({ userId: `z${i}`, net: 0n })),
      ...B([['a', 5], ['b', -5]]),
    ];
    expect(planSettlement(balances)).toMatchObject({ algorithm: 'exact_dp', provenOptimal: true, nonZeroCount: 2 });
  });
});

describe('verifySettlement', () => {
  const balances = B([['a', 30], ['b', -10], ['c', -20]]);
  it('accepts an exact settlement', () => {
    expect(verifySettlement(balances, planSettlement(balances).transfers)).toBe(true);
  });
  it('rejects anything that leaves a cent behind or is malformed', () => {
    expect(verifySettlement(balances, [{ from: 'b', to: 'a', amount: 10n }])).toBe(false);
    expect(verifySettlement(balances, [{ from: 'b', to: 'a', amount: 10n }, { from: 'c', to: 'a', amount: 21n }])).toBe(false);
    expect(verifySettlement(balances, [{ from: 'a', to: 'a', amount: 1n }])).toBe(false);
    expect(verifySettlement(balances, [{ from: 'b', to: 'a', amount: 0n }])).toBe(false);
    expect(verifySettlement(balances, [{ from: 'x', to: 'a', amount: 1n }])).toBe(false);
  });
  it('huge balances never overflow: they skip the 64-bit DP and use the heuristic', () => {
    const big = 2n ** 63n;
    const bs = [{ userId: 'a', net: big }, { userId: 'b', net: -big }];
    const plan = planSettlement(bs);
    expect(plan.algorithm).toBe('heuristic');
    expect(verifySettlement(bs, plan.transfers)).toBe(true);
  });
});
