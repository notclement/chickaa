import type { TripFxRatesResponse } from '@ncc/contracts';
import { CURRENCIES, CURRENCY_CODES } from '@ncc/core';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { Button, Card, FormError, SelectField, TextField } from '../ui/index.tsx';

/**
 * Owner-only: fix an exchange rate for the whole trip (e.g. what you actually got at the money changer).
 * New expenses in that currency use it by default; existing expenses keep the rate they were saved with.
 */
export function TripRatesCard({ tripId, baseCurrency }: { tripId: string; baseCurrency: string }) {
  const rates = useApi(() => api<TripFxRatesResponse>(`/trips/${tripId}/fx-rates`), [tripId]);
  const options = CURRENCY_CODES.filter((c) => c !== baseCurrency);
  const [currency, setCurrency] = useState<string>(options[0]!);
  const [rate, setRate] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/trips/${tripId}/fx-rates/${currency}`, { method: 'PUT', json: { rate } });
      setRate('');
      void rates.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (c: string) => {
    await api(`/trips/${tripId}/fx-rates/${c}`, { method: 'DELETE' }).catch((err) => setError(errorMessage(err)));
    void rates.reload();
  };

  return (
    <Card>
      <h2 className="font-bold">Fixed exchange rates</h2>
      <p className="mt-1 text-sm text-ink-700">
        Optional. Without one, each expense uses that day’s rate. Changing a rate never changes expenses already saved.
      </p>
      {rates.data && rates.data.rates.length > 0 && (
        <ul className="mt-3 divide-y divide-ink-900/5">
          {rates.data.rates.map((r) => (
            <li key={r.currency} className="flex items-center justify-between py-2 text-sm">
              <span>
                1 {r.currency} = <b>{r.rate}</b> {baseCurrency}
              </span>
              <button type="button" onClick={() => remove(r.currency)} className="rounded-xl px-2 py-1 font-semibold text-owes">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={save} className="mt-3 grid grid-cols-[7rem_1fr] items-end gap-2">
        <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {options.map((c) => (
            <option key={c} value={c} title={CURRENCIES[c].name}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField label={`1 ${currency} = ? ${baseCurrency}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Enter rate" />
        <div className="col-span-2">
          <FormError message={error} />
          <Button type="submit" variant="secondary" block loading={busy} disabled={!rate.trim()} className="mt-2">
            Save rate
          </Button>
        </div>
      </form>
    </Card>
  );
}
