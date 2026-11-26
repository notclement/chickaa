import type { AdminTrip, AdminTripsResponse, AdminUser, AdminUsersResponse, SetSupporterRequest, TripTag } from '@ncc/contracts';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { SupporterBadge, supporterUntilText } from '../components/SupporterBadge.tsx';
import { TAGS, TripTagChip } from '../components/TripTagChip.tsx';
import { formatDateRange } from '../lib/format.ts';
import { money } from '../lib/money.ts';
import { Avatar, Button, Card, ErrorState, FormError, Loading, ScreenTitle, TextField } from '../ui/index.tsx';

const ORDER: TripTag[] = ['ongoing', 'active', 'needs_finishing', 'pending_settlement', 'ended', 'deleted'];

/** Admin only: every trip and every user. Opening a trip you're not in is read-only. */
export function AdminScreen() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'users' ? 'users' : 'trips';
  if (!me.isAdmin) return <ErrorState message="This page doesn’t exist." />;
  return (
    <div className="space-y-4">
      <ScreenTitle
        title={tab === 'users' ? 'All users' : 'All trips'}
        subtitle="Admin view · read-only for trips you’re not in"
        back="/account"
      />
      <div className="grid grid-cols-2 gap-1 rounded-full bg-ink-900/5 p-1" role="tablist" aria-label="Admin sections">
        {(['trips', 'users'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'users' ? { tab: 'users' } : {}, { replace: true })}
            className={`min-h-10 rounded-full text-sm font-semibold ${tab === t ? 'bg-white shadow-sm' : 'text-ink-500'}`}
          >
            {t === 'trips' ? 'Trips' : 'Users'}
          </button>
        ))}
      </div>
      {tab === 'users' ? <UsersTab /> : <TripsTab />}
    </div>
  );
}

function TripsTab() {
  const { data, error, loading, reload } = useApi(() => api<AdminTripsResponse>('/admin/trips'), []);
  const [filter, setFilter] = useState<TripTag | 'all'>('all');

  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const trips = (data?.trips ?? []).filter((t) => filter === 'all' || t.tag === filter);

  return (
    <div className="space-y-4">
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
            <li key={t.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-ink-900/5" data-testid="admin-trip">
              <Link to={`/trips/${t.id}`} className="block p-4 active:bg-ink-900/[0.02]">
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
              <HardDelete trip={t} onDeleted={reload} />
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

/** Supporter status for one user: +1 month, lifetime, or remove. */
function SupporterControls({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const [busy, setBusy] = useState<SetSupporterRequest['action'] | null>(null);
  const [error, setError] = useState<string>();
  const act = async (action: SetSupporterRequest['action']) => {
    setBusy(action);
    setError(undefined);
    try {
      await api(`/admin/users/${user.id}/supporter`, { method: 'POST', json: { action } });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const s = user.supporter;
  return (
    <div className="mb-2 space-y-2 rounded-2xl bg-cream p-3" data-testid="supporter-controls">
      <div className="text-sm">
        <b>Supporter:</b>{' '}
        <span data-testid="supporter-status">{s.active ? (s.lifetime ? 'Lifetime' : `Yes, ${supporterUntilText(s)}`) : 'No'}</span>
      </div>
      <div className="text-xs text-ink-500">
        {user.referredBy ? `Invited by @${user.referredBy}` : 'Signed up without an invite'} · invited {user.invited}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="secondary" loading={busy === 'month'} disabled={!!busy || s.lifetime} onClick={() => void act('month')}>
          +1 month
        </Button>
        <Button variant="secondary" loading={busy === 'lifetime'} disabled={!!busy || s.lifetime} onClick={() => void act('lifetime')}>
          Lifetime
        </Button>
        <Button variant="ghost" loading={busy === 'remove'} disabled={!!busy || (!s.active && !s.until)} onClick={() => void act('remove')}>
          Remove
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}

/** Permanently delete a trip (e.g. test trips). Typing the exact name confirms. */
function HardDelete({ trip, onDeleted }: { trip: AdminTrip; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!open)
    return (
      <div className="flex justify-end border-t border-ink-900/5 px-4 py-1.5">
        <button type="button" onClick={() => setOpen(true)} className="min-h-9 text-sm font-semibold text-owes">
          Delete permanently…
        </button>
      </div>
    );
  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/admin/trips/${trip.id}`, { method: 'DELETE', json: { confirmName: name } });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 border-t border-ink-900/5 bg-owes/5 p-4">
      <p className="text-sm text-ink-700">
        Removes the trip, its expenses and settlements <b>for everyone, forever</b>. Members’ balances in it disappear too.
      </p>
      <TextField label={`Type “${trip.name}” to confirm`} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => (setOpen(false), setName(''), setError(undefined))}>
          Cancel
        </Button>
        <Button variant="danger" loading={busy} disabled={name.trim() !== trip.name.trim()} onClick={remove}>
          Delete forever
        </Button>
      </div>
    </div>
  );
}

/** Every user, newest last, with the trips they own or belong to. */
function UsersTab() {
  const { data, error, loading, reload } = useApi(() => api<AdminUsersResponse>('/admin/users'), []);
  const [q, setQ] = useState('');
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (loading && !data) return <Loading />;
  const all = data?.users ?? [];
  const needle = q.trim().toLowerCase();
  const users = needle ? all.filter((u) => u.username.toLowerCase().includes(needle) || u.displayName.toLowerCase().includes(needle)) : all;

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${all.length} user${all.length === 1 ? '' : 's'}`}
        aria-label="Search users"
        className="min-h-11 w-full rounded-2xl bg-white px-4 ring-1 ring-ink-900/10 focus:outline-none focus:ring-2 focus:ring-ink-900"
      />
      {users.length === 0 ? (
        <Card className="text-center text-ink-500">No users.</Card>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const current = u.trips.filter((t) => !t.left);
            return (
              <li key={u.id}>
                <details className="group rounded-3xl bg-white shadow-sm ring-1 ring-ink-900/5" data-testid="admin-user">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <Avatar name={u.displayName} id={u.id} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">
                        {u.displayName}
                        {u.isAdmin && <span className="ml-2 rounded-full bg-ink-900 px-2 py-0.5 text-xs text-cream">Admin</span>}
                        <SupporterBadge supporter={u.supporter} className="ml-2" />
                      </div>
                      <div className="truncate text-sm text-ink-500">@{u.username}</div>
                      <div className="text-xs text-ink-500">
                        joined {new Date(u.createdAt).toLocaleDateString()}
                        {u.lastSeenAt ? ` · last active ${new Date(u.lastSeenAt).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-ink-900/5 px-2.5 py-1 text-xs font-semibold" data-testid="user-trip-count">
                      {current.length} trip{current.length === 1 ? '' : 's'}
                    </span>
                    <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="border-t border-ink-900/5 px-4 pb-3 pt-2">
                    <SupporterControls user={u} onChanged={reload} />
                    {u.trips.length === 0 ? (
                      <p className="py-1 text-sm text-ink-500">Not in any trip yet.</p>
                    ) : (
                      <ul className="divide-y divide-ink-900/5">
                        {u.trips.map((t) => (
                          <li key={t.id}>
                            <Link to={`/trips/${t.id}`} className="flex items-center justify-between gap-2 py-2" data-testid="admin-user-trip">
                              <span className="min-w-0">
                                <span className={`block truncate font-semibold ${t.left ? 'text-ink-500 line-through' : ''}`}>{t.name}</span>
                                <span className="text-xs text-ink-500">{t.role === 'owner' ? 'Owner' : 'Member'}{t.left ? ' · left' : ''}</span>
                              </span>
                              <TripTagChip tag={t.tag} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
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
      className={`min-h-9 rounded-full px-3 text-sm font-semibold ring-1 ${active ? 'bg-ink-900 text-cream ring-ink-900' : 'bg-white ring-ink-900/10'}`}
    >
      {children}
    </button>
  );
}
