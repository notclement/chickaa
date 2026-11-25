import type { Expense } from '@ncc/contracts';
import { Link } from 'react-router';
import { money } from '../lib/money.ts';

/** One line in an expense list: what, who paid, total, and what it means for me. */
export function ExpenseRow({ e, me, nameOf }: { e: Expense; me: string; nameOf: (id: string) => string }) {
  const paidByMe = e.payers.find((p) => p.userId === me);
  const myShare = e.splits.find((s) => s.userId === me);
  const myNet = BigInt(paidByMe?.baseAmount ?? '0') - BigInt(myShare?.baseAmount ?? '0');
  const payers = e.payers.length === 1 ? (e.payers[0]!.userId === me ? 'You' : nameOf(e.payers[0]!.userId)) : `${e.payers.length} people`;
  const foreign = e.currency !== e.baseCurrency;

  return (
    <Link to={`/expenses/${e.id}`} className="flex items-center gap-3 py-3 active:bg-ink-900/[0.02]" data-testid="expense-row">
      <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun-300/40 text-lg" aria-hidden>
        🧾
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{e.description}</div>
        <div className="truncate text-sm text-ink-500">
          {payers} paid {money(e.amount, e.currency)}
        </div>
      </div>
      <div className="text-right">
        {myNet > 0n ? (
          <div className="text-sm font-bold text-owed">you lent {money(myNet, e.baseCurrency)}</div>
        ) : myNet < 0n ? (
          <div className="text-sm font-bold text-owes">you owe {money(-myNet, e.baseCurrency)}</div>
        ) : (
          <div className="text-sm text-ink-500">{myShare || paidByMe ? 'even' : 'not involved'}</div>
        )}
        {foreign && <div className="text-xs text-ink-500">≈ {money(e.baseAmount, e.baseCurrency)}</div>}
      </div>
    </Link>
  );
}

/** Groups expenses by date, newest first. */
export function groupByDate(list: Expense[]): [string, Expense[]][] {
  const map = new Map<string, Expense[]>();
  for (const e of list) map.set(e.expenseDate, [...(map.get(e.expenseDate) ?? []), e]);
  return [...map.entries()];
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
