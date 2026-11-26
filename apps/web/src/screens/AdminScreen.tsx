import type { AdminTripsResponse, TripTag } from '@ncc/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { TAGS, TripTagChip } from '../components/TripTagChip.tsx';
import { formatDateRange } from '../lib/format.ts';
import { money } from '../lib/money.ts';
import { Card, ErrorState, Loading, ScreenTitle } from '../ui/index.tsx';

const ORDER: TripTag[] = ['ongoing', 'active', 'needs_finishing', 'pending_settlement', 'ended', 'deleted'];

/** Admin only: every trip on the app with its status. Opening a trip you're not in is read-only. */
export function AdminScreen() {
  const me = useMe();
  const { data, error, loading, reload } = useApi(() => api<AdminTripsResponse>('/admin/trips'), []);
  const [filter, setFilter] = useState<TripTag | 'all'>('all');

  if (!me.isAdmin) return <ErrorState message="This page doesn’t exist." />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const trips = (data?.trips ?? []).filter((t) => filter === 'all' || t.tag === filter);

  return (
    <div className="space-y-4">
      <ScreenTitle title="All trips" subtitle="Admin view · read-only for trips you’re not in" back="/account" />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All · {data?.trips.length ?? 0}
        </FilterChip>
        {ORDER.filter((t) => data?.counts[t]).map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {TAGS[t].label} · {data!.counts[t]}
          </FilterChip>
        ))}
      </div>

      {trips.length === 0 ? (
        <Card className="text-center text-ink-500">No trips.</Card>
      ) : (
        <ul className="space-y-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link to={`/trips/${t.id}`} className="block rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink-900/5 active:bg-ink-900/[0.02]" data-testid="admin-trip">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{t.name}</div>
                    <div className="truncate text-sm text-ink-500">
                      by {t.ownerName} (@{t.ownerUsername}){t.iAmMember ? ' · you’re a member' : ''}
                    </div>
                  </div>
                  <TripTagChip tag={t.tag} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-ink-500">
                  <span>
                    {t.memberCount} {t.memberCount === 1 ? 'person' : 'people'}
                  </span>
                  <span>
                    {t.expenseCount} expense{t.expenseCount === 1 ? '' : 's'} · {money(t.totalSpent, t.baseCurrency)}
                  </span>
                  {formatDateRange(t.startDate, t.endDate) && <span>{formatDateRange(t.startDate, t.endDate)}</span>}
                  <span>created {new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Card className="!p-4">
        <h2 className="text-sm font-bold">What the tags mean</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {ORDER.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <TripTagChip tag={t} /> <span className="text-ink-700">{TAGS[t].help}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ${active ? 'bg-ink-900 text-cream ring-ink-900' : 'bg-white ring-ink-900/10'}`}
    >
      {children}
    </button>
  );
}
