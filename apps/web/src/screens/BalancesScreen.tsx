import type { BalancesResponse } from '@ncc/contracts';
import { useParams } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { BalanceList } from '../components/BalanceList.tsx';
import { money } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

export function BalancesScreen() {
  const { id } = useParams();
  const me = useMe();
  const { trip, nameOf } = useTrip(id);
  const { data, error, reload } = useApi(() => api<BalancesResponse>(`/trips/${id}/balances`), [id]);
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (!data || !trip) return <Loading />;

  return (
    <div className="space-y-4">
      <ScreenTitle title="Balances" subtitle={`${trip.name} · in ${data.baseCurrency}`} back={`/trips/${id}`} />
      <Card className="!p-4">
        <div className="text-sm text-ink-500">Total spent</div>
        <div className="text-2xl font-extrabold tabular-nums">{money(data.totalSpent, data.baseCurrency)}</div>
        <div className="text-sm text-ink-500">
          {data.expenseCount} expense{data.expenseCount === 1 ? '' : 's'}
        </div>
      </Card>
      <Card>
        <BalanceList data={data} me={me.id} nameOf={nameOf} detailed />
      </Card>
      <p className="px-2 text-center text-sm text-ink-500">
        Paid = what each person paid. Share = their part of the expenses. The difference is what they get back or owe.
        Settling up with the fewest transfers is coming in the next update.
      </p>
    </div>
  );
}
