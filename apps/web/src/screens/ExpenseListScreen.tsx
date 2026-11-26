import type { ExpenseCategory, ExpenseListResponse } from '@ncc/contracts';
import { EXPENSE_CATEGORIES } from '@ncc/core';
import { useParams, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { ExpenseRow, groupByDate, prettyDate } from '../components/ExpenseRow.tsx';
import { CATEGORY } from '../lib/categories.ts';
import { money } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

export function ExpenseListScreen() {
  const { id } = useParams();
  const me = useMe();
  const { trip, nameOf } = useTrip(id);
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useApi(() => api<ExpenseListResponse>(`/trips/${id}/expenses`), [id]);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const all = data?.expenses ?? [];
  const filter = EXPENSE_CATEGORIES.find((c) => c === params.get('category')) ?? null;
  const list = filter ? all.filter((e) => e.category === filter) : all;
  const used = EXPENSE_CATEGORIES.filter((c) => all.some((e) => e.category === c));
  const filteredTotal = list.reduce((sum, e) => sum + BigInt(e.baseAmount), 0n);
  const pick = (c: ExpenseCategory | null) => setParams(c ? { category: c } : {}, { replace: true });

  return (
    <div className="space-y-4">
      <ScreenTitle title="Expenses" subtitle={trip?.name} back={`/trips/${id}`} />
      {trip?.status === 'active' && trip.myRole !== 'viewer' && (
        <ButtonLink to={`/trips/${id}/expenses/new`} block needsNetwork>
          ＋ Add expense
        </ButtonLink>
      )}
      {used.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by category">
          <FilterChip active={!filter} onClick={() => pick(null)}>
            All · {all.length}
          </FilterChip>
          {used.map((c) => (
            <FilterChip key={c} active={filter === c} onClick={() => pick(filter === c ? null : c)}>
              <span aria-hidden>{CATEGORY[c].emoji}</span> {CATEGORY[c].label} · {all.filter((e) => e.category === c).length}
            </FilterChip>
          ))}
        </div>
      )}
      {filter && trip && list.length > 0 && (
        <p className="text-sm text-ink-700" data-testid="category-total">
          {CATEGORY[filter].label}: <b>{money(filteredTotal, trip.baseCurrency)}</b> across {list.length} expense{list.length === 1 ? '' : 's'}
        </p>
      )}
      {list.length === 0 ? (
        <Card className="text-center text-ink-700">{filter ? `No ${CATEGORY[filter].label.toLowerCase()} expenses.` : 'No expenses yet.'}</Card>
      ) : (
        groupByDate(list).map(([date, rows]) => (
          <section key={date}>
            <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-ink-500">{prettyDate(date)}</h2>
            <Card className="!py-1">
              <ul className="divide-y divide-ink-900/5">
                {rows.map((e) => (
                  <li key={e.id}>
                    <ExpenseRow e={e} me={me.id} nameOf={nameOf} />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-semibold ring-1 ${active ? 'bg-ink-900 text-cream ring-ink-900' : 'bg-white ring-ink-900/10'}`}
    >
      {children}
    </button>
  );
}
