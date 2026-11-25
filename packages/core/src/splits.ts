/**
 * The four split methods (SPEC §10). "Unequal" and "Exact amount" are the same thing,
 * so they share the `exact` type (ARCHITECTURE.md §10).
 * Output rows keep the input order; amounts are integer minor units that sum to the total.
 */
import { allocate } from './allocate.ts';
import { FinanceError } from './errors.ts';

export type SplitInput =
  | { type: 'equal'; participants: string[] }
  | { type: 'exact'; amounts: { userId: string; amount: bigint }[] }
  | { type: 'percentage'; percents: { userId: string; basisPoints: number }[] }
  | { type: 'shares'; shares: { userId: string; shares: number }[] };

export type SplitType = SplitInput['type'];

export interface ShareRow {
  userId: string;
  amount: bigint;
}

export const MAX_SHARES = 1000;

function checkPeople(ids: string[]): void {
  if (ids.length === 0) throw new FinanceError('INVALID_SPLIT', 'Choose at least one person to share this expense', 'split');
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new FinanceError('INVALID_SPLIT', 'Someone is listed twice in the split', 'split');
    seen.add(id);
  }
}

export function computeSplit(total: bigint, input: SplitInput): ShareRow[] {
  if (total <= 0n) throw new FinanceError('INVALID_AMOUNT', 'The amount must be more than 0', 'total');

  switch (input.type) {
    case 'equal': {
      checkPeople(input.participants);
      const parts = allocate(total, input.participants.map(() => 1n));
      return input.participants.map((userId, i) => ({ userId, amount: parts[i]! }));
    }

    case 'exact': {
      checkPeople(input.amounts.map((a) => a.userId));
      let sum = 0n;
      for (const a of input.amounts) {
        if (a.amount < 0n) throw new FinanceError('INVALID_SPLIT', 'Amounts can’t be negative', 'split');
        sum += a.amount;
      }
      if (sum !== total) {
        throw new FinanceError('INVALID_SPLIT', `The amounts add up to ${sum < total ? 'less' : 'more'} than the total`, 'split');
      }
      return input.amounts.map((a) => ({ userId: a.userId, amount: a.amount }));
    }

    case 'percentage': {
      checkPeople(input.percents.map((p) => p.userId));
      let bp = 0;
      for (const p of input.percents) {
        if (!Number.isInteger(p.basisPoints) || p.basisPoints <= 0 || p.basisPoints > 10_000) {
          throw new FinanceError('INVALID_SPLIT', 'Each percentage must be between 0.01% and 100%', 'split');
        }
        bp += p.basisPoints;
      }
      if (bp !== 10_000) throw new FinanceError('INVALID_SPLIT', 'Percentages must add up to exactly 100%', 'split');
      const parts = allocate(total, input.percents.map((p) => BigInt(p.basisPoints)));
      return input.percents.map((p, i) => ({ userId: p.userId, amount: parts[i]! }));
    }

    case 'shares': {
      checkPeople(input.shares.map((s) => s.userId));
      for (const s of input.shares) {
        if (!Number.isInteger(s.shares) || s.shares <= 0 || s.shares > MAX_SHARES) {
          throw new FinanceError('INVALID_SPLIT', `Shares must be whole numbers from 1 to ${MAX_SHARES}`, 'split');
        }
      }
      const parts = allocate(total, input.shares.map((s) => BigInt(s.shares)));
      return input.shares.map((s, i) => ({ userId: s.userId, amount: parts[i]! }));
    }
  }
}
