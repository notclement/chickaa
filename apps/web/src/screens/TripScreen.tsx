import type { TripDetail } from '@ncc/contracts';
import { Link, useParams } from 'react-router';
import { api, ApiRequestError, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { currencyLabel, formatDateRange } from '../lib/format.ts';
import { Avatar, Badge, ButtonLink, Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

/** Trip dashboard. Expenses, balances and settle-up arrive in later phases. */
export function TripScreen() {
  const { id } = useParams();
  const me = useMe();
  const { data: trip, error, loading, reload } = useApi(() => api<TripDetail>(`/trips/${id}`), [id]);

  if (loading && !trip) return <Loading />;
  if (error) {
    const notFound = error instanceof ApiRequestError && error.status === 404;
    return <ErrorState message={notFound ? 'This trip doesn’t exist, or you’re not a member of it.' : errorMessage(error)} onRetry={notFound ? undefined : reload} />;
  }
  if (!trip) return null;

  const owner = trip.myRole === 'owner';
  const dates = formatDateRange(trip.startDate, trip.endDate);
  const ownerName = trip.members.find((m) => m.role === 'owner')?.displayName;

  return (
    <div className="space-y-4">
      <ScreenTitle title={trip.name} back="/" subtitle={dates ?? undefined} />

      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{currencyLabel(trip.baseCurrency)}</Badge>
          <Badge tone={trip.status === 'active' ? 'good' : 'neutral'}>{trip.status === 'active' ? 'Active' : trip.status === 'completed' ? 'Completed' : 'Archived'}</Badge>
          {owner && (
            <Link to={`/trips/${trip.id}/edit`} className="ml-auto rounded-xl px-2 py-1 text-sm font-semibold text-ink-500 active:bg-ink-900/5">
              ⚙︎ Settings
            </Link>
          )}
        </div>
        {trip.description && <p className="mt-3 whitespace-pre-line text-ink-700">{trip.description}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">
            People <span className="text-ink-500">· {trip.memberCount}</span>
          </h2>
        </div>
        <ul className="mt-3 divide-y divide-ink-900/5">
          {trip.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.displayName} id={m.userId} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {m.displayName}
                  {m.userId === me.id && <span className="font-normal text-ink-500"> (you)</span>}
                </div>
                <div className="truncate text-sm text-ink-500">@{m.username}</div>
              </div>
              {m.role === 'owner' && <Badge tone="brand">Owner</Badge>}
            </li>
          ))}
        </ul>
        {owner && trip.status === 'active' ? (
          <ButtonLink to={`/trips/${trip.id}/invite`} block>
            ＋ Invite people
          </ButtonLink>
        ) : (
          trip.status === 'active' && <p className="mt-2 text-sm text-ink-500">Want to add someone? Ask {ownerName ?? 'the owner'} for an invite link.</p>
        )}
      </Card>

      <Card className="text-center">
        <div className="text-3xl" aria-hidden>
          🧾
        </div>
        <h2 className="mt-2 font-bold">Expenses are coming next</h2>
        <p className="mt-1 text-sm text-ink-700">Adding expenses, balances and settling up arrive in the next updates.</p>
      </Card>
    </div>
  );
}
