import type { BalancesResponse, TripDetail } from '@chickaa/contracts';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { money } from '../lib/money.ts';
import { Button, Card, FormError, TextField } from '../ui/index.tsx';

/** Owner only. Allowed once every balance is exactly zero; typing the trip name confirms. */
export function DeleteTripCard({ trip }: { trip: TripDetail }) {
  const navigate = useNavigate();
  const balances = useApi(() => api<BalancesResponse>(`/trips/${trip.id}/balances`), [trip.id]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const nameOf = (id: string) => trip.members.find((m) => m.userId === id)?.displayName ?? 'Former member';
  const unsettled = balances.data?.balances.filter((b) => b.net !== '0') ?? [];
  const canDelete = !!balances.data && unsettled.length === 0;

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/trips/${trip.id}`, { method: 'DELETE', json: { confirmName: name } });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      void balances.reload();
    }
  };

  return (
    <Card className="ring-owes/20">
      <h2 className="font-bold text-owes">Delete trip</h2>
      {!balances.data ? (
        <p className="mt-1 text-sm text-ink-500">Checking balances…</p>
      ) : !canDelete ? (
        <>
          <p className="mt-1 text-sm text-ink-700">You can delete the trip once everyone is settled up. Still open:</p>
          <ul className="mt-2 space-y-1 text-sm" data-testid="unsettled">
            {unsettled.map((b) => (
              <li key={b.userId} className="flex justify-between">
                <span>{nameOf(b.userId)}</span>
                <span className={`font-semibold tabular-nums ${b.net.startsWith('-') ? 'text-owes' : 'text-owed'}`}>
                  {b.net.startsWith('-') ? `owes ${money(BigInt(b.net) * -1n, trip.baseCurrency)}` : `gets back ${money(b.net, trip.baseCurrency)}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : !open ? (
        <>
          <p className="mt-1 text-sm text-ink-700">Everyone is settled. Deleting removes the trip for all {trip.memberCount} members.</p>
          <Button variant="danger" block className="mt-3" onClick={() => setOpen(true)}>
            Delete trip…
          </Button>
        </>
      ) : (
        <div className="mt-2 space-y-3">
          <TextField label={`Type “${trip.name}” to confirm`} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => (setOpen(false), setName(''))}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={name.trim() !== trip.name.trim()} onClick={remove}>
              Delete for everyone
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
