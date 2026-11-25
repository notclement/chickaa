/**
 * Turns one expense (as entered) into the exact numbers we store:
 * original amounts per payer and per participant, and the same in the trip's base currency.
 *
 * Invariants (checked by property tests):
 *   Σ payers.original = Σ splits.original = total
 *   Σ payers.base     = Σ splits.base     = baseTotal = convert(total)
 * Base amounts are ALLOCATED from baseTotal in proportion to the original amounts, never converted
 * one by one: converting each share separately would let rounding drift by a cent or more.
 */
import { allocate } from './allocate.ts';
import type { CurrencyCode } from './currencies.ts';
import { FinanceError } from './errors.ts';
import { convert, isOne, parseRate, rateToString } from './rate.ts';
import { computeSplit, type SplitInput } from './splits.ts';

export interface ExpenseInput {
  total: bigint;
  currency: CurrencyCode;
  baseCurrency: CurrencyCode;
  /** Decimal string: 1 unit of `currency` = rate units of `baseCurrency`. Must be "1" if the same. */
  rate: string;
  payers: { userId: string; amount: bigint }[];
  split: SplitInput;
}

export interface Allocation {
  userId: string;
  original: bigint;
  base: bigint;
}

export interface BuiltExpense {
  total: bigint;
  baseTotal: bigint;
  /** Canonical rate string as stored. */
  rate: string;
  payers: Allocation[];
  splits: Allocation[];
}

export function buildExpense(input: ExpenseInput): BuiltExpense {
  const { total, currency, baseCurrency } = input;
  if (total <= 0n) throw new FinanceError('INVALID_AMOUNT', 'The amount must be more than 0', 'total');

  const rate = parseRate(input.rate);
  if (currency === baseCurrency && !isOne(rate)) {
    throw new FinanceError('INVALID_RATE', 'An expense in the trip’s own currency must use rate 1', 'rate');
  }

  // Payers
  if (input.payers.length === 0) throw new FinanceError('INVALID_PAYERS', 'Choose who paid', 'payers');
  const seen = new Set<string>();
  let paid = 0n;
  for (const p of input.payers) {
    if (seen.has(p.userId)) throw new FinanceError('INVALID_PAYERS', 'Someone is listed twice as a payer', 'payers');
    seen.add(p.userId);
    if (p.amount <= 0n) throw new FinanceError('INVALID_PAYERS', 'Each payer must have paid more than 0', 'payers');
    paid += p.amount;
  }
  if (paid !== total) {
    throw new FinanceError('INVALID_PAYERS', `What people paid adds up to ${paid < total ? 'less' : 'more'} than the total`, 'payers');
  }

  const shares = computeSplit(total, input.split);

  const baseTotal = convert(total, currency, baseCurrency, rate);
  if (baseTotal <= 0n) {
    throw new FinanceError('AMOUNT_TOO_SMALL', `That amount is too small to show in ${baseCurrency}`, 'total');
  }

  const payerBase = allocate(baseTotal, input.payers.map((p) => p.amount));
  const splitBase = allocate(baseTotal, shares.map((s) => s.amount));

  return {
    total,
    baseTotal,
    rate: rateToString(rate),
    payers: input.payers.map((p, i) => ({ userId: p.userId, original: p.amount, base: payerBase[i]! })),
    splits: shares.map((s, i) => ({ userId: s.userId, original: s.amount, base: splitBase[i]! })),
  };
}
