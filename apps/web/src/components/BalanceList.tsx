import type { BalancesResponse } from '@chickaa/contracts';
import { money } from '../lib/money.ts';
import { Avatar } from '../ui/index.tsx';

/** Who's owed (green), who owes (red), who's even (grey). */
export function BalanceList({ data, me, nameOf, detailed = false }: { data: BalancesResponse; me: string; nameOf: (id: string) => string; detailed?: boolean }) {
  const cur = data.baseCurrency;
  return (
    <ul className="divide-y divide-ink-900/5">
      {data.balances.map((b) => {
        const net = BigInt(b.net);
        const name = b.userId === me ? 'You' : nameOf(b.userId);
        return (
          <li key={b.userId} className="flex items-center gap-3 py-2.5" data-testid="balance-row">
            <Avatar name={nameOf(b.userId)} id={b.userId} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{name}</div>
              {detailed && (
                <div className="text-xs text-ink-500 tabular-nums">
                  paid {money(b.paid, cur)} · share {money(b.share, cur)}
                </div>
              )}
            </div>
            <div className={`text-right text-sm font-bold tabular-nums ${net > 0n ? 'text-owed' : net < 0n ? 'text-owes' : 'text-ink-500'}`}>
              {net > 0n ? (
                <>
                  <span className="block text-xs font-semibold">{b.userId === me ? 'you get back' : 'gets back'}</span>
                  {money(net, cur)}
                </>
              ) : net < 0n ? (
                <>
                  <span className="block text-xs font-semibold">{b.userId === me ? 'you owe' : 'owes'}</span>
                  {money(-net, cur)}
                </>
              ) : (
                'settled up'
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
