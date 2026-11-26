import type { BalancesResponse, ExpenseListResponse, SettlementResponse } from '@ncc/contracts';
import { Link, useParams } from 'react-router';
import { api, ApiRequestError, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { ExpenseRow } from '../components/ExpenseRow.tsx';
import { WhoOwesWho } from '../components/WhoOwesWho.tsx';
import { currencyLabel, formatDateRange } from '../lib/format.ts';
import { money } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { Avatar, Badge, ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

/** Trip dashboard: totals, my position, balances, recent expenses, people. */
export function TripScreen() {
  const { id } = useParams();
  const me = useMe();
  const { trip, error, loading, reload, nameOf } = useTrip(id);
  const balances = useApi(() => api<BalancesResponse>(`/trips/${id}/balances`), [id]);
  const expenses = useApi(() => api<ExpenseListResponse>(`/trips/${id}/expenses`), [id]);
  const settle = useApi(() => api<SettlementResponse>(`/trips/${id}/settlement`), [id, trip?.status, balances.data?.totalSpent]);

  if (loading && !trip) return <Loading />;
  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return <ErrorState message={notFound ? 'This trip doesn’t exist, or you’re not a member of it.' : errorMessage(error)} onRetry={notFound ? undefined : reload} />;
  }
  if (!trip) return null;

  const owner = trip.myRole === 'owner';
  const viewer = trip.myRole === 'viewer'; // admin looking at someone else's trip: read-only
  const active = trip.status === 'active' && !viewer;
  const ownerName = trip.members.find((m) => m.role === 'owner')?.displayName;
  const mine = balances.data?.balances.find((b) => b.userId === me.id);
  const myNet = mine ? BigInt(mine.net) : 0n;
  const list = expenses.data?.expenses ?? [];

  return (
    <div className="space-y-4 pb-20">
      <ScreenTitle title={trip.name} back="/" subtitle={formatDateRange(trip.startDate, trip.endDate) ?? undefined} />

      {viewer && (
        <div className="rounded-2xl bg-ink-900 px-4 py-2 text-sm font-semibold text-cream" data-testid="admin-view">
          🛡️ Admin view · read-only (you’re not in this trip)
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{currencyLabel(trip.baseCurrency)}</Badge>
        <Badge tone={trip.status === 'active' ? 'good' : 'neutral'}>{trip.status === 'active' ? 'Active' : trip.status === 'completed' ? 'Completed' : 'Archived'}</Badge>
        {owner && (
          <Link to={`/trips/${trip.id}/edit`} className="ml-auto rounded-xl px-2 py-1 text-sm font-semibold text-ink-500 active:bg-ink-900/5">
            ⚙︎ Settings
          </Link>
        )}
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink-900/5">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Trip total</div>
          <div className="mt-1 text-xl font-extrabold tabular-nums" data-testid="trip-total">
            {balances.data ? money(balances.data.totalSpent, trip.baseCurrency) : '…'}
          </div>
        </div>
        {viewer ? (
          <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink-900/5">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Expenses</div>
            <div className="mt-1 text-xl font-extrabold tabular-nums">{balances.data?.expenseCount ?? '…'}</div>
          </div>
        ) : (
        <div className={`rounded-3xl p-4 shadow-sm ring-1 ring-ink-900/5 ${myNet > 0n ? 'bg-owed/10' : myNet < 0n ? 'bg-owes/10' : 'bg-white'}`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">{myNet > 0n ? 'You get back' : myNet < 0n ? 'You owe' : 'You’re'}</div>
          <div className={`mt-1 text-xl font-extrabold tabular-nums ${myNet > 0n ? 'text-owed' : myNet < 0n ? 'text-owes' : ''}`} data-testid="my-balance">
            {!balances.data ? '…' : myNet === 0n ? 'settled up' : money(myNet < 0n ? -myNet : myNet, trip.baseCurrency)}
          </div>
        </div>
        )}
      </section>

      {trip.description && <p className="whitespace-pre-line px-1 text-ink-700">{trip.description}</p>}

      {settle.data && (trip.status === 'active' ? (balances.data?.expenseCount ?? 0) > 0 : true) && (
        <Link
          to={`/trips/${trip.id}/settle`}
          data-testid="settle-entry"
          className={`flex items-center gap-3 rounded-3xl p-4 shadow-sm ring-1 ring-ink-900/5 ${
            settle.data.progress.fullySettled ? 'bg-owed/10' : trip.status === 'active' ? 'bg-white' : 'bg-sun-300/40'
          }`}
        >
          <span className="text-2xl" aria-hidden>
            {settle.data.progress.fullySettled ? '🎉' : '💸'}
          </span>
          <span className="flex-1">
            <span className="block font-bold">
              {settle.data.progress.fullySettled
                ? 'All settled'
                : trip.status === 'active'
                  ? 'Settle up'
                  : `Settling up · ${settle.data.progress.confirmed} of ${settle.data.progress.total} confirmed`}
            </span>
            <span className="block text-sm text-ink-700">
              {trip.status === 'active'
                ? `${settle.data.transfers.length} transfer${settle.data.transfers.length === 1 ? '' : 's'} would square everyone up`
                : settle.data.progress.fullySettled
                  ? 'Everyone has paid and been paid back'
                  : 'See who pays whom'}
            </span>
          </span>
          <span aria-hidden className="text-ink-500">
            ›
          </span>
        </Link>
      )}

      {settle.data && (balances.data?.expenseCount ?? 0) > 0 && <WhoOwesWho tripId={trip.id} data={settle.data} me={me.id} nameOf={nameOf} />}

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Recent expenses</h2>
          {list.length > 0 && (
            <Link to={`/trips/${trip.id}/expenses`} className="text-sm font-semibold text-tangerine-600">
              See all {list.length}
            </Link>
          )}
        </div>
        {expenses.loading && !expenses.data ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-ink-500">Nothing yet. Add the first expense: hotel, dinner, taxi…</p>
        ) : (
          <ul className="divide-y divide-ink-900/5">
            {list.slice(0, 4).map((e) => (
              <li key={e.id}>
                <ExpenseRow e={e} me={me.id} nameOf={nameOf} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-bold">
          People <span className="text-ink-500">· {trip.memberCount}</span>
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {trip.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 rounded-full bg-cream py-1 pl-1 pr-3 text-sm font-semibold ring-1 ring-ink-900/5">
              <Avatar name={m.displayName} id={m.userId} size="sm" />
              {m.userId === me.id ? `${m.displayName} (you)` : m.displayName}
              {m.role === 'owner' && <span className="text-xs text-tangerine-700">owner</span>}
            </li>
          ))}
        </ul>
        {owner && active ? (
          <ButtonLink to={`/trips/${trip.id}/invite`} variant="secondary" block needsNetwork>
            ＋ Invite people
          </ButtonLink>
        ) : (
          active && !viewer && <p className="mt-3 text-sm text-ink-500">Want to add someone? Ask {ownerName ?? 'the owner'} for an invite link.</p>
        )}
      </Card>

      {active && (
        <div className="fixed inset-x-0 bottom-safe z-10 px-safe">
          <div className="mx-auto max-w-xl">
            <ButtonLink to={`/trips/${trip.id}/expenses/new`} block needsNetwork>
              ＋ Add expense
            </ButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}
