/**
 * Balances for a trip (SPEC §11), all in base-currency minor units:
 *
 *   net = Σ paid − Σ share + Σ confirmed transfers sent − Σ confirmed transfers received
 *
 * Positive: should receive money. Negative: owes money. Zero: balanced.
 * Only CONFIRMED transfers count (a payment marked "sent" isn't settled until the recipient confirms).
 * The function verifies that every expense reconciles and that all nets sum to zero.
 */
import { FinanceError } from './errors.ts';

export interface LedgerExpense {
  payers: { userId: string; base: bigint }[];
  splits: { userId: string; base: bigint }[];
}

export type TransferStatus = 'pending' | 'sent' | 'confirmed' | 'disputed' | 'cancelled';

export interface LedgerTransfer {
  fromUserId: string;
  toUserId: string;
  amount: bigint;
  status: TransferStatus;
}

export interface Balance {
  userId: string;
  paid: bigint;
  share: bigint;
  transfersOut: bigint;
  transfersIn: bigint;
  net: bigint;
}

export function computeBalances(input: {
  /** Current members, in display order (join order). */
  members: string[];
  /** Non-deleted expenses only. */
  expenses: LedgerExpense[];
  transfers: LedgerTransfer[];
}): { balances: Balance[]; totalSpent: bigint } {
  const rows = new Map<string, Balance>();
  const row = (userId: string) => {
    let r = rows.get(userId);
    if (!r) {
      r = { userId, paid: 0n, share: 0n, transfersOut: 0n, transfersIn: 0n, net: 0n };
      rows.set(userId, r);
    }
    return r;
  };
  for (const m of input.members) row(m);

  let totalSpent = 0n;
  input.expenses.forEach((e, idx) => {
    let paid = 0n;
    let shared = 0n;
    for (const p of e.payers) {
      row(p.userId).paid += p.base;
      paid += p.base;
    }
    for (const s of e.splits) {
      row(s.userId).share += s.base;
      shared += s.base;
    }
    if (paid !== shared) {
      throw new FinanceError('LEDGER_INCONSISTENT', `Expense #${idx + 1} doesn’t reconcile: paid ${paid} ≠ shared ${shared}`);
    }
    totalSpent += paid;
  });

  for (const t of input.transfers) {
    if (t.status !== 'confirmed') continue;
    row(t.fromUserId).transfersOut += t.amount;
    row(t.toUserId).transfersIn += t.amount;
  }

  let sum = 0n;
  for (const r of rows.values()) {
    r.net = r.paid - r.share + r.transfersOut - r.transfersIn;
    sum += r.net;
  }
  // Unreachable when every expense reconciles; kept as a last line of defence.
  /* v8 ignore next */
  if (sum !== 0n) throw new FinanceError('LEDGER_INCONSISTENT', `Balances don’t sum to zero (off by ${sum})`);

  return { balances: [...rows.values()], totalSpent };
}
