import type { BalancesResponse, SettlementEventsResponse, SettlementResponse, SettlementTransfer, TripDetail } from '@ncc/contracts';
import { formatAmount, isCurrencyCode } from '@ncc/core';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, errorMessage, post } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { relativeTime } from '../lib/format.ts';
import { money } from '../lib/money.ts';
import { useTrip } from '../lib/useTrip.ts';
import { Avatar, Badge, Button, Card, ErrorState, FormError, Loading, ScreenTitle } from '../ui/index.tsx';

const STATUS: Record<SettlementTransfer['status'], { label: string; tone: string }> = {
  pending: { label: 'Not paid yet', tone: 'bg-ink-900/5 text-ink-700' },
  sent: { label: 'Sent · waiting for confirmation', tone: 'bg-sun-300/60 text-ink-900' },
  confirmed: { label: 'Received ✓', tone: 'bg-owed/15 text-owed' },
  disputed: { label: 'Not received', tone: 'bg-owes/10 text-owes' },
  cancelled: { label: 'Cancelled', tone: 'bg-ink-900/5 text-ink-500 line-through' },
};

export function SettleUpScreen() {
  const { id } = useParams();
  const me = useMe();
  const { trip, nameOf, reload: reloadTrip } = useTrip(id);
  const s = useApi(() => api<SettlementResponse>(`/trips/${id}/settlement`), [id]);
  const balances = useApi(() => api<BalancesResponse>(`/trips/${id}/balances`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  if (s.error) return <ErrorState message={errorMessage(s.error)} onRetry={s.reload} />;
  if (!s.data || !trip) return <Loading />;
  const data = s.data;
  const owner = trip.myRole === 'owner';
  const who = (uid: string) => (uid === me.id ? 'You' : nameOf(uid));

  const act = async (key: string, path: string, body?: unknown) => {
    setBusy(key);
    setError(undefined);
    try {
      s.setData(await post<SettlementResponse>(path, body));
      void balances.reload();
      if (path.endsWith('/complete') || path.endsWith('/reopen')) void reloadTrip();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const mine = data.transfers.filter((t) => t.fromUserId === me.id || t.toUserId === me.id);
  const others = data.transfers.filter((t) => t.fromUserId !== me.id && t.toUserId !== me.id);

  return (
    <div className="space-y-4">
      <ScreenTitle title="Settle up" subtitle={trip.name} back={`/trips/${id}`} />
      <FormError message={error} />

      {data.state === 'preview' ? (
        <PreviewCard data={data} trip={trip} owner={owner} busy={busy === 'complete'} onFinish={() => act('complete', `/trips/${id}/complete`)} />
      ) : (
        <ProgressCard data={data} />
      )}

      {data.transfers.length > 0 && (
        <>
          {mine.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-500">Yours</h2>
              <ul className="space-y-2">
                {mine.map((t) => (
                  <TransferCard key={t.id ?? `${t.fromUserId}-${t.toUserId}`} t={t} me={me.id} who={who} nameOf={nameOf} plan={data.state === 'plan'} owner={owner} busy={busy} act={act} />
                ))}
              </ul>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-500">Everyone else</h2>
              <ul className="space-y-2">
                {others.map((t) => (
                  <TransferCard key={t.id ?? `${t.fromUserId}-${t.toUserId}`} t={t} me={me.id} who={who} nameOf={nameOf} plan={data.state === 'plan'} owner={owner} busy={busy} act={act} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {data.state === 'plan' && balances.data && <SummaryCard data={data} balances={balances.data} who={who} />}

      {data.state === 'plan' && owner && !data.progress.fullySettled && (
        <Card>
          <h2 className="font-bold">Forgot an expense?</h2>
          <p className="mt-1 text-sm text-ink-700">
            Reopen the trip to add or fix expenses. Transfers already received stay counted; the rest are recalculated when you finish again.
          </p>
          <Button
            variant="secondary"
            block
            className="mt-3"
            loading={busy === 'reopen'}
            onClick={() => window.confirm('Reopen the trip? Unpaid transfers will be cancelled and recalculated later.') && act('reopen', `/trips/${id}/reopen`)}
          >
            Reopen trip
          </Button>
        </Card>
      )}
    </div>
  );
}

function OptimalBadge({ data }: { data: SettlementResponse }) {
  return data.provenOptimal ? <Badge tone="good">Minimum possible</Badge> : <Badge>Efficient, not proven minimal</Badge>;
}

function PreviewCard({ data, trip, owner, busy, onFinish }: { data: SettlementResponse; trip: TripDetail; owner: boolean; busy: boolean; onFinish: () => void }) {
  const n = data.transfers.length;
  const ownerName = trip.members.find((m) => m.role === 'owner')?.displayName ?? 'the trip creator';
  return (
    <Card>
      {n === 0 ? (
        <p className="font-semibold">Everyone’s even. Nothing to pay. 🎉</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold" data-testid="transfer-count">
              {n} transfer{n === 1 ? '' : 's'} settle{n === 1 ? 's' : ''} everyone
            </h2>
            <OptimalBadge data={data} />
          </div>
          <p className="mt-1 text-sm text-ink-700">
            Instead of everyone paying everyone back for each expense, these {n} bank transfer{n === 1 ? '' : 's'} square up all {data.nonZeroCount} people who
            owe or are owed.
          </p>
        </>
      )}
      {owner ? (
        <>
          <p className="mt-3 text-sm text-ink-500">When the trip’s over, finish it. Expenses lock, and everyone can start paying and confirming.</p>
          <Button
            block
            className="mt-3"
            loading={busy}
            onClick={() => window.confirm('Finish the trip? Expenses will be locked (you can reopen it later).') && onFinish()}
          >
            Finish trip & settle up
          </Button>
        </>
      ) : (
        <p className="mt-3 text-sm text-ink-500">This is a preview. When the trip’s over, {ownerName} finishes it and you can start paying.</p>
      )}
    </Card>
  );
}

function ProgressCard({ data }: { data: SettlementResponse }) {
  const { confirmed, total, fullySettled } = data.progress;
  const pct = total ? (confirmed * 100) / total : 100;
  return (
    <Card className={fullySettled ? 'bg-owed/10' : ''}>
      {fullySettled ? (
        <div className="text-center" data-testid="fully-settled">
          <div className="text-4xl" aria-hidden>
            🎉
          </div>
          <h2 className="mt-1 text-xl font-extrabold">All settled!</h2>
          <p className="text-sm text-ink-700">Every transfer has been confirmed. Everyone’s balance is zero.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold" data-testid="progress">
              {confirmed} of {total} transfers confirmed
            </h2>
            <OptimalBadge data={data} />
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-ink-900/5" role="progressbar" aria-valuenow={confirmed} aria-valuemax={total}>
            <ProgressFill pct={pct} />
          </div>
          <p className="mt-2 text-sm text-ink-500">Pay with your usual banking app (PayNow, bank transfer…), then mark it here. The person receiving it confirms.</p>
        </>
      )}
    </Card>
  );
}

/** Width via a fixed set of classes (CSP blocks inline styles). */
function ProgressFill({ pct }: { pct: number }) {
  const steps = ['w-0', 'w-1/12', 'w-2/12', 'w-3/12', 'w-4/12', 'w-5/12', 'w-6/12', 'w-7/12', 'w-8/12', 'w-9/12', 'w-10/12', 'w-11/12', 'w-full'];
  const idx = pct >= 100 ? 12 : Math.min(11, Math.round((pct / 100) * 12));
  return <div className={`h-full rounded-full bg-owed transition-all ${steps[idx]}`} />;
}

function TransferCard(props: {
  t: SettlementTransfer;
  me: string;
  who: (id: string) => string;
  nameOf: (id: string) => string;
  plan: boolean;
  owner: boolean;
  busy: string | null;
  act: (key: string, path: string, body?: unknown) => Promise<void>;
}) {
  const { t, me, who, plan } = props;
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const iPay = t.fromUserId === me;
  const iReceive = t.toUserId === me;
  const busy = (a: string) => props.busy === `${a}:${t.id}`;
  const st = STATUS[t.status];
  const amountPlain = isCurrencyCode(t.currency) ? formatAmount(BigInt(t.amount), t.currency).replaceAll(',', '') : t.amount;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(amountPlain);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <li className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ${iPay || iReceive ? 'ring-tangerine-500/40' : 'ring-ink-900/5'}`} data-testid="transfer">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          <Avatar name={props.nameOf(t.fromUserId)} id={t.fromUserId} size="sm" />
          <Avatar name={props.nameOf(t.toUserId)} id={t.toUserId} size="sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {iPay ? (
              <>
                You pay <b>{who(t.toUserId)}</b>
              </>
            ) : iReceive ? (
              <>
                <b>{who(t.fromUserId)}</b> pays you
              </>
            ) : (
              <>
                {who(t.fromUserId)} → {who(t.toUserId)}
              </>
            )}
          </div>
          {plan && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${st.tone}`}>{st.label}</span>}
        </div>
        <div className="text-right text-lg font-extrabold tabular-nums">{money(t.amount, t.currency)}</div>
      </div>

      {plan && (
        <div className="mt-3 flex flex-wrap gap-2">
          {iPay && (t.status === 'pending' || t.status === 'disputed') && (
            <>
              <Button variant="secondary" className="!min-h-10 text-sm" onClick={copy}>
                {copied ? '✓ Copied' : `Copy ${amountPlain}`}
              </Button>
              <Button className="!min-h-10 flex-1 text-sm" loading={busy('sent')} onClick={() => props.act(`sent:${t.id}`, `/settlements/${t.id}/sent`)}>
                I’ve sent it
              </Button>
            </>
          )}
          {iReceive && (t.status === 'sent' || t.status === 'pending') && (
            <Button className="!min-h-10 flex-1 text-sm" loading={busy('confirm')} onClick={() => props.act(`confirm:${t.id}`, `/settlements/${t.id}/confirm`)}>
              Got it ✓
            </Button>
          )}
          {iReceive && t.status === 'sent' && (
            <Button
              variant="danger"
              className="!min-h-10 text-sm"
              loading={busy('dispute')}
              onClick={() => {
                const note = window.prompt('What’s wrong? (optional, e.g. “nothing in my account yet”)');
                if (note !== null) void props.act(`dispute:${t.id}`, `/settlements/${t.id}/dispute`, { note });
              }}
            >
              Not received
            </Button>
          )}
          {props.owner && (t.status === 'pending' || t.status === 'disputed') && (
            <button
              type="button"
              className="ml-auto min-h-10 rounded-xl px-2 text-sm font-semibold text-ink-500"
              onClick={() => window.confirm('Cancel this transfer? Only do this if it was settled some other way.') && props.act(`cancel:${t.id}`, `/settlements/${t.id}/cancel`)}
            >
              Cancel
            </button>
          )}
          <button type="button" className="min-h-10 rounded-xl px-2 text-sm font-semibold text-ink-500" onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide history' : 'History'}
          </button>
        </div>
      )}
      {showHistory && t.id && <TransferHistory id={t.id} updatedAt={t.updatedAt} me={me} />}
    </li>
  );
}

function TransferHistory({ id, updatedAt, me }: { id: string; updatedAt: string | null; me: string }) {
  const { data } = useApi(() => api<SettlementEventsResponse>(`/settlements/${id}/events`), [id, updatedAt]);
  if (!data) return <p className="mt-2 text-sm text-ink-500">Loading…</p>;
  const verb = { pending: 'created the plan', sent: 'marked it as sent', confirmed: 'confirmed receipt', disputed: 'said it wasn’t received', cancelled: 'cancelled it' } as const;
  return (
    <ol className="mt-2 space-y-1 border-t border-ink-900/5 pt-2 text-sm text-ink-700">
      {data.events.map((e, i) => (
        <li key={i}>
          {e.actor.userId === me ? 'You' : e.actor.displayName} {verb[e.toStatus]}
          {e.note && <span className="text-ink-500"> · “{e.note}”</span>} <span className="text-ink-500">{relativeTime(e.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Final trip summary (SPEC §14 I). */
function SummaryCard({ data, balances, who }: { data: SettlementResponse; balances: BalancesResponse; who: (id: string) => string }) {
  const cur = balances.baseCurrency;
  const live = data.transfers.filter((t) => t.status !== 'cancelled');
  const confirmedAmount = live.filter((t) => t.status === 'confirmed').reduce((s, t) => s + BigInt(t.amount), 0n);
  return (
    <Card>
      <h2 className="font-bold">Trip summary</h2>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-ink-500">Total expenses</dt>
        <dd className="text-right font-semibold tabular-nums">{money(balances.totalSpent, cur)}</dd>
        <dt className="text-ink-500">Recommended transfers</dt>
        <dd className="text-right font-semibold">{live.length}</dd>
        <dt className="text-ink-500">Confirmed</dt>
        <dd className="text-right font-semibold tabular-nums">
          {data.progress.confirmed} · {money(confirmedAmount, cur)}
        </dd>
        <dt className="text-ink-500">Status</dt>
        <dd className="text-right font-semibold">{data.progress.fullySettled ? 'Fully settled ✓' : 'Settling up'}</dd>
      </dl>
      <h3 className="mt-4 text-sm font-bold text-ink-700">Each person</h3>
      <ul className="mt-1 divide-y divide-ink-900/5 text-sm">
        {balances.balances.map((b) => {
          const before = BigInt(b.paid) - BigInt(b.share);
          const now = BigInt(b.net);
          return (
            <li key={b.userId} className="flex items-center justify-between py-1.5">
              <span>{who(b.userId)}</span>
              <span className="tabular-nums">
                <span className={before > 0n ? 'text-owed' : before < 0n ? 'text-owes' : 'text-ink-500'}>{money(before, cur, { signed: true })}</span>
                <span className="text-ink-500"> → {now === 0n ? '0 ✓' : money(now, cur, { signed: true })}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
