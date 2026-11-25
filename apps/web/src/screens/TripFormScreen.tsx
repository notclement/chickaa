import type { TripDetail } from '@ncc/contracts';
import { CURRENCIES, CURRENCY_CODES } from '@ncc/core';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, ApiRequestError, errorMessage, patch, post } from '../api/client.ts';
import { DeleteTripCard } from '../components/DeleteTripCard.tsx';
import { TripRatesCard } from '../components/TripRatesCard.tsx';
import { useUnsavedChanges } from '../pwa/unsavedChanges.ts';
import { Button, Card, ErrorState, FormError, Loading, ScreenTitle, SelectField, TextField } from '../ui/index.tsx';

interface FormState {
  name: string;
  baseCurrency: string;
  description: string;
  startDate: string;
  endDate: string;
}

const EMPTY: FormState = { name: '', baseCurrency: 'SGD', description: '', startDate: '', endDate: '' };

export function CreateTripScreen() {
  const navigate = useNavigate();
  return (
    <>
      <ScreenTitle title="New trip" subtitle="You can invite friends right after." back="/" />
      <TripForm
        initial={EMPTY}
        submitLabel="Create trip"
        onSubmit={async (f) => {
          const trip = await post<TripDetail>('/trips', toPayload(f));
          navigate(`/trips/${trip.id}`, { replace: true });
        }}
      />
    </>
  );
}

export function EditTripScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripDetail>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api<TripDetail>(`/trips/${id}`).then(setTrip, setError);
  }, [id]);

  if (error) return <ErrorState message={errorMessage(error)} />;
  if (!trip) return <Loading />;
  if (trip.myRole !== 'owner') return <ErrorState message="Only the trip owner can edit trip settings." />;

  return (
    <>
      <ScreenTitle title="Trip settings" back={`/trips/${id}`} />
      <TripForm
        initial={{
          name: trip.name,
          baseCurrency: trip.baseCurrency,
          description: trip.description ?? '',
          startDate: trip.startDate ?? '',
          endDate: trip.endDate ?? '',
        }}
        submitLabel="Save changes"
        currencyHint="Can’t be changed once expenses have been added."
        onSubmit={async (f) => {
          await patch<TripDetail>(`/trips/${id}`, toPayload(f));
          navigate(`/trips/${id}`, { replace: true });
        }}
      />
      <div className="mt-4">
        <TripRatesCard tripId={trip.id} baseCurrency={trip.baseCurrency} />
      </div>
      <div className="mt-4">
        <DeleteTripCard trip={trip} />
      </div>
    </>
  );
}

function toPayload(f: FormState) {
  return {
    name: f.name,
    baseCurrency: f.baseCurrency,
    description: f.description || null,
    startDate: f.startDate || null,
    endDate: f.endDate || null,
  };
}

function TripForm({
  initial,
  submitLabel,
  currencyHint = 'All balances and the final settle-up are calculated in this currency.',
  onSubmit,
}: {
  initial: FormState;
  submitLabel: string;
  currencyHint?: string;
  onSubmit: (f: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedChanges(dirty && !busy);

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setFields({});
    try {
      await onSubmit(form);
    } catch (err) {
      const f = err instanceof ApiRequestError ? err.fields : {};
      setFields(f);
      setError(Object.keys(f).length ? undefined : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Trip name" placeholder="Bali 2027" value={form.name} onChange={set('name')} error={fields.name} maxLength={60} autoFocus={!initial.name} />
        <SelectField label="Base currency" value={form.baseCurrency} onChange={set('baseCurrency')} hint={currencyHint} error={fields.baseCurrency}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c} · {CURRENCIES[c].name}
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Start (optional)" type="date" value={form.startDate} onChange={set('startDate')} error={fields.startDate} />
          <TextField label="End (optional)" type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} error={fields.endDate} />
        </div>
        <div>
          <label htmlFor="trip-desc" className="mb-1.5 block text-sm font-semibold text-ink-700">
            Description (optional)
          </label>
          <textarea
            id="trip-desc"
            rows={3}
            maxLength={500}
            value={form.description}
            onChange={set('description')}
            placeholder="Beach, temples, too much nasi goreng"
            className="block w-full rounded-2xl border-0 bg-white px-4 py-3 ring-1 ring-ink-900/10 placeholder:text-ink-500/60 focus:ring-2 focus:ring-tangerine-500 focus:outline-none"
          />
        </div>
        <FormError message={error} />
        <Button type="submit" block loading={busy} disabled={!form.name.trim()}>
          {submitLabel}
        </Button>
      </form>
    </Card>
  );
}
