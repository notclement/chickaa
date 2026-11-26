import type { Expense, ExpenseRevisionsResponse } from '@ncc/contracts';
import { formatPercent } from '@ncc/core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { prettyDate } from '../components/ExpenseRow.tsx';
import { relativeTime } from '../lib/format.ts';
import { money } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { Avatar, Badge, Button, ButtonLink, Card, ErrorState, FormError, Loading, ScreenTitle } from '../ui/index.tsx';

const SPLIT_LABEL = { equal: 'Split equally', exact: 'Split by amounts', percentage: 'Split by percentage', shares: 'Split by shares' } as const;
const RATE_LABEL = { same_currency: '', api: 'Daily rate', trip_fixed: 'Trip’s fixed rate', manual: 'Entered manually' } as const;

export function ExpenseDetailScreen() {
  const { eid } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const { data: e, error, reload } = useApi(() => api<Expense>(`/expenses/${eid}`), [eid]);
  const { trip, nameOf } = useTrip(e?.tripId);
  const history = useApi(() => api<ExpenseRevisionsResponse>(`/expenses/${eid}/revisions`), [eid]);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState<string>();

  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (!e || !trip) return <Loading />;

  const canEdit = !e.deleted && trip.status === 'active' && (trip.myRole === 'owner' || e.createdBy === me.id);
  const foreign = e.currency !== e.baseCurrency;
  const who = (id: string) => (id === me.id ? 'You' : nameOf(id));

  const remove = async () => {
    if (!window.confirm(`Delete “${e.description}”? Balances will update. It stays in the history.`)) return;
    setBusy(true);
    try {
      await api(`/expenses/${e.id}?version=${e.version}`, { method: 'DELETE' });
      navigate(`/trips/${e.tripId}`, { replace: true });
    } catch (err) {
      setDelError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ScreenTitle title={e.description} subtitle={prettyDate(e.expenseDate)} back={`/trips/${e.tripId}`} />
      {e.deleted && <Badge>Deleted</Badge>}

      <Card>
        <div className="text-3xl font-extrabold tabular-nums">{money(e.amount, e.currency)}</div>
        {foreign && (
          <p className="mt-1 text-ink-700">
            = <b>{money(e.baseAmount, e.baseCurrency)}</b> at 1 {e.currency} = {e.rate} {e.baseCurrency}
            <span className="block text-sm text-ink-500">
              {RATE_LABEL[e.rateSource]}
              {e.rateSource === 'api' && ` for ${e.rateDate}`}
            </span>
          </p>
        )}
        {e.notes && <p className="mt-3 whitespace-pre-line rounded-2xl bg-cream p-3 text-sm">{e.notes}</p>}
      </Card>

      <Card>
        <h2 className="font-bold">Paid by</h2>
        <ul className="mt-2 divide-y divide-ink-900/5">
          {e.payers.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2">
              <Avatar name={nameOf(p.userId)} id={p.userId} size="sm" />
              <span className="flex-1 font-semibold">{who(p.userId)}</span>
              <span className="tabular-nums">{money(p.amount, e.currency)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold">{SPLIT_LABEL[e.splitType]}</h2>
        <ul className="mt-2 divide-y divide-ink-900/5">
          {e.splits.map((s) => (
            <li key={s.userId} className="flex items-center gap-3 py-2">
              <Avatar name={nameOf(s.userId)} id={s.userId} size="sm" />
              <span className="flex-1 font-semibold">
                {who(s.userId)}
                {s.percentBp != null && <span className="font-normal text-ink-500"> · {formatPercent(s.percentBp)}%</span>}
                {s.shares != null && (
                  <span className="font-normal text-ink-500">
                    {' '}
                    · {s.shares} share{s.shares === 1 ? '' : 's'}
                  </span>
                )}
              </span>
              <span className="text-right tabular-nums">
                {money(s.amount, e.currency)}
                {foreign && <span className="block text-xs text-ink-500">{money(s.baseAmount, e.baseCurrency)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {canEdit && (
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink to={`/expenses/${e.id}/edit`} variant="secondary" needsNetwork>
            Edit
          </ButtonLink>
          <Button variant="danger" loading={busy} needsNetwork onClick={remove}>
            Delete
          </Button>
        </div>
      )}
      <FormError message={delError} />

      {history.data && history.data.revisions.length > 0 && (
        <Card>
          <h2 className="font-bold">History</h2>
          <ol className="mt-2 space-y-1 text-sm text-ink-700">
            {history.data.revisions.map((r) => (
              <li key={r.version}>
                {r.actor.userId === me.id ? 'You' : r.actor.displayName} {r.action === 'create' ? 'added' : r.action === 'update' ? 'edited' : 'deleted'} it{' '}
                <span className="text-ink-500">{relativeTime(r.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
