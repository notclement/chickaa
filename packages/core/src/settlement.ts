/**
 * Settle-up optimiser (SPEC §12): the fewest bank transfers that bring every balance to zero.
 *
 * Maths. Any settlement is a graph; each connected component must sum to zero and needs at least
 * (size − 1) transfers. So the minimum number of transfers is n − k, where n is the number of
 * people with a non-zero balance and k is the largest number of disjoint zero-sum groups they can
 * be split into. Each such group is then settled in exactly (size − 1) transfers.
 *
 * Exact algorithm (n ≤ EXACT_LIMIT): subset dynamic programming over bitmasks.
 *   sum[mask] = Σ balances in mask                          O(2ⁿ)
 *   dp[mask]  = max over i ∈ mask of dp[mask∖{i}] + [sum[mask] = 0]
 *   k = dp[all]                                             O(2ⁿ · n) time, O(2ⁿ) memory
 * For n = 20: ~2·10⁷ steps and ~9 MB, well under a second on a small server.
 *
 * Larger groups (rare for trips) use a fast heuristic: cancel exactly-opposite pairs, then
 * largest-debtor-pays-largest-creditor. It is always a valid settlement, but is NOT claimed optimal.
 *
 * Everything is integer minor units (bigint). Tie-breaks follow the input order, so the same
 * balances always give the same plan.
 */
import { FinanceError } from './errors.ts';

export const EXACT_LIMIT = 20;

export interface NetBalance {
  userId: string;
  net: bigint;
}

export interface Transfer {
  from: string;
  to: string;
  amount: bigint;
}

export interface SettlementPlan {
  transfers: Transfer[];
  algorithm: 'exact_dp' | 'heuristic';
  /** True only when the exact algorithm ran: the transfer count is the proven minimum. */
  provenOptimal: boolean;
  /** People with a non-zero balance. */
  nonZeroCount: number;
}

interface Person {
  idx: number; // position in the input (tie-break)
  userId: string;
  net: bigint;
}

function validate(balances: NetBalance[]): Person[] {
  const seen = new Set<string>();
  let sum = 0n;
  for (const b of balances) {
    if (seen.has(b.userId)) throw new FinanceError('LEDGER_INCONSISTENT', 'A person appears twice in the balances');
    seen.add(b.userId);
    sum += b.net;
  }
  if (sum !== 0n) throw new FinanceError('LEDGER_INCONSISTENT', `Balances don’t sum to zero (off by ${sum})`);
  return balances.map((b, idx) => ({ idx, userId: b.userId, net: b.net })).filter((p) => p.net !== 0n);
}

/** Settles one zero-sum group: biggest debtor pays biggest creditor, repeat. ≤ size − 1 transfers. */
function settleGroup(group: Person[]): Transfer[] {
  const byAmount = (a: Person, b: Person) => {
    const x = a.net < 0n ? -a.net : a.net;
    const y = b.net < 0n ? -b.net : b.net;
    return x === y ? a.idx - b.idx : x > y ? -1 : 1;
  };
  const creditors = group.filter((p) => p.net > 0n).map((p) => ({ ...p }));
  const debtors = group.filter((p) => p.net < 0n).map((p) => ({ ...p }));
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = c.net < -d.net ? c.net : -d.net;
    out.push({ from: d.userId, to: c.userId, amount });
    c.net -= amount;
    d.net += amount;
    if (c.net === 0n) creditors.shift();
    if (d.net === 0n) debtors.shift();
  }
  return out;
}

/** The classic greedy (for comparison and as the heuristic's last step). Not optimal in general. */
export function greedySettlement(balances: NetBalance[]): Transfer[] {
  return settleGroup(validate(balances));
}

function exactGroups(people: Person[]): Person[][] {
  const n = people.length;
  const size = 1 << n;
  const full = size - 1;
  const sum = new BigInt64Array(size);
  const dp = new Uint8Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low]! + people[i]!.net;
    let best = 0;
    for (let m = mask; m; m &= m - 1) {
      const v = dp[mask ^ (m & -m)]!;
      if (v > best) best = v;
    }
    dp[mask] = best + (sum[mask] === 0n ? 1 : 0);
  }

  // Walk one optimal chain full ⊃ … ⊃ ∅ (always removing the lowest-index person that keeps the
  // optimum). The zero-sum masks on that chain are nested; their differences are the groups.
  const zeros: number[] = [];
  let mask = full;
  while (mask) {
    const isZero = sum[mask] === 0n;
    if (isZero) zeros.push(mask);
    const target = dp[mask]! - (isZero ? 1 : 0);
    let next = -1;
    for (let m = mask; m; m &= m - 1) {
      const bit = m & -m;
      if (dp[mask ^ bit] === target) {
        next = mask ^ bit;
        break;
      }
    }
    mask = next;
  }
  zeros.reverse(); // smallest first
  const groups: Person[][] = [];
  let prev = 0;
  for (const z of zeros) {
    const g = z & ~prev;
    groups.push(people.filter((_, i) => g & (1 << i)));
    prev = z;
  }
  return groups;
}

function order(people: Person[]) {
  const pos = new Map(people.map((p) => [p.userId, p.idx]));
  return (a: Transfer, b: Transfer) => pos.get(a.from)! - pos.get(b.from)! || pos.get(a.to)! - pos.get(b.to)!;
}

export function planSettlement(balances: NetBalance[], opts: { exactLimit?: number } = {}): SettlementPlan {
  const people = validate(balances);
  const limit = opts.exactLimit ?? EXACT_LIMIT;
  if (people.length === 0) return { transfers: [], algorithm: 'exact_dp', provenOptimal: true, nonZeroCount: 0 };

  if (people.length <= limit) {
    const transfers = exactGroups(people).flatMap(settleGroup).sort(order(people));
    return { transfers, algorithm: 'exact_dp', provenOptimal: true, nonZeroCount: people.length };
  }

  // Heuristic: exact opposite pairs first (each saves a transfer), then greedy on the rest.
  const used = new Set<number>();
  const transfers: Transfer[] = [];
  for (const d of people) {
    if (d.net >= 0n || used.has(d.idx)) continue;
    const c = people.find((p) => !used.has(p.idx) && p.net === -d.net);
    if (c) {
      used.add(d.idx).add(c.idx);
      transfers.push({ from: d.userId, to: c.userId, amount: c.net });
    }
  }
  transfers.push(...settleGroup(people.filter((p) => !used.has(p.idx))));
  return { transfers: transfers.sort(order(people)), algorithm: 'heuristic', provenOptimal: false, nonZeroCount: people.length };
}
