import type { SettlementResponse } from '@chickaa/contracts';
import { Link } from 'react-router';
import { money } from '../lib/money.ts';
import { Avatar } from '../ui/index.tsx';

const STATUS_NOTE = { pending: '', sent: 'sent · awaiting confirmation', confirmed: 'paid ✓', disputed: 'not received', cancelled: 'cancelled' } as const;

/**
 * Splitwise-style "who owes whom" summary, live at any time: the same minimum-transfer plan as
 * Settle up (a preview while the trip is active, the stored plan once it's finished).
 */
export function WhoOwesWho({ tripId, data, me, nameOf }: { tripId: string; data: SettlementResponse; me: string; nameOf: (id: string) => string }) {
  const rows = data.transfers
    .filter((t) => t.status !== 'cancelled')
    .sort((a, b) => Number(b.fromUserId === me || b.toUserId === me) - Number(a.fromUserId === me || a.toUserId === me));
  const who = (id: string) => (id === me ? 'You' : nameOf(id));

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-900/5" data-testid="who-owes-who">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Who owes who</h2>
        <Link to={`/trips/${tripId}/balances`} className="text-sm font-semibold text-tangerine-600">
          Balances
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">Everyone’s even. Nobody owes anything. 🎉</p>
      ) : (
        <ul className="mt-1 divide-y divide-ink-900/5">
          {rows.map((t) => {
            const iPay = t.fromUserId === me;
            const iGet = t.toUserId === me;
            const done = t.status === 'confirmed';
            return (
              <li key={t.id ?? `${t.fromUserId}>${t.toUserId}`} className="flex items-center gap-3 py-2.5" data-testid="owes-row">
                <div className="flex -space-x-2">
                  <Avatar name={nameOf(t.fromUserId)} id={t.fromUserId} size="sm" />
                  <Avatar name={nameOf(t.toUserId)} id={t.toUserId} size="sm" />
                </div>
                <div className={`min-w-0 flex-1 text-sm ${done ? 'text-ink-500 line-through' : ''}`}>
                  <b>{who(t.fromUserId)}</b> {iPay ? 'owe' : 'owes'} <b>{iGet ? 'you' : nameOf(t.toUserId)}</b>
                  {(t.settledOutside || STATUS_NOTE[t.status]) && (
                    <span className="block text-xs text-ink-500 no-underline">{t.settledOutside ? (t.status === 'confirmed' ? 'settled another way ✓' : 'settled another way? · awaiting confirmation') : STATUS_NOTE[t.status]}</span>
                  )}
                </div>
                <div className={`text-right font-extrabold tabular-nums ${done ? 'text-ink-500' : iPay ? 'text-owes' : iGet ? 'text-owed' : ''}`}>
                  {money(t.amount, t.currency)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 0 && data.state === 'preview' && (
        <p className="mt-2 text-xs text-ink-500">
          Live: updates with every expense. The fewest transfers that square everyone up{data.provenOptimal ? '' : ' (efficient, not proven minimal)'}.
        </p>
      )}
    </section>
  );
}
