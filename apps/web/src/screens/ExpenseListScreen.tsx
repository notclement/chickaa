import type { ExpenseListResponse } from '@ncc/contracts';
import { useParams } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { ExpenseRow, groupByDate, prettyDate } from '../components/ExpenseRow.tsx';
import { useTrip } from '../lib/useTrip.ts';
import { ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

export function ExpenseListScreen() {
  const { id } = useParams();
  const me = useMe();
  const { trip, nameOf } = useTrip(id);
  const { data, error, loading, reload } = useApi(() => api<ExpenseListResponse>(`/trips/${id}/expenses`), [id]);

  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const list = data?.expenses ?? [];

  return (
    <div className="space-y-4">
      <ScreenTitle title="Expenses" subtitle={trip?.name} back={`/trips/${id}`} />
      {trip?.status === 'active' && (
        <ButtonLink to={`/trips/${id}/expenses/new`} block>
          ＋ Add expense
        </ButtonLink>
      )}
      {list.length === 0 ? (
        <Card className="text-center text-ink-700">No expenses yet.</Card>
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
