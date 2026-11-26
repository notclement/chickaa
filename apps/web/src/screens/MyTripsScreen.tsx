import type { TripListResponse, TripSummary } from '@ncc/contracts';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useMe } from '../auth/AuthContext.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { extractInviteToken, formatDateRange } from '../lib/format.ts';
import { prefetchTrips } from '../offline/prefetch.ts';
import { Badge, Button, ButtonLink, Card, ErrorState, Loading, TextField } from '../ui/index.tsx';

export function MyTripsScreen() {
  const me = useMe();
  const { data, error, loading, reload } = useApi(() => api<TripListResponse>('/trips'), []);
  const trips = data?.trips ?? [];
  const active = trips.filter((t) => t.status === 'active');
  const done = trips.filter((t) => t.status !== 'active');
  useEffect(() => {
    if (data?.trips.length) void prefetchTrips(data.trips);
  }, [data]);

  return (
    <div className="space-y-5 pt-2">
      <div>
        <p className="text-sm font-semibold text-ink-500">Hi {me.displayName} 👋</p>
        <h1 className="text-2xl font-extrabold tracking-tight">My trips</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ButtonLink to="/trips/new" needsNetwork>＋ New trip</ButtonLink>
        <JoinByLinkButton />
      </div>

      {loading && !data ? (
        <Loading label="Loading trips…" />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={reload} />
      ) : trips.length === 0 ? (
        <Card className="text-center">
          <div className="text-4xl" aria-hidden>
            🧳
          </div>
          <h2 className="mt-2 font-bold">No trips yet</h2>
          <p className="mt-1 text-sm text-ink-700">Start one and invite your friends, or open an invite link someone sent you.</p>
        </Card>
      ) : (
        <>
          {active.length > 0 && <TripList title="Active" trips={active} />}
          {done.length > 0 && <TripList title="Completed" trips={done} />}
        </>
      )}

      <InstallCard />
    </div>
  );
}

function TripList({ title, trips }: { title: string; trips: TripSummary[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-500">{title}</h2>
      <ul className="space-y-2">
        {trips.map((t) => (
          <li key={t.id}>
            <Link
              to={`/trips/${t.id}`}
              className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-ink-900/5 active:bg-ink-900/[0.02]"
            >
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-tangerine-100 text-xl" aria-hidden>
                ✈️
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{t.name}</div>
                <div className="truncate text-sm text-ink-500">
                  {[formatDateRange(t.startDate, t.endDate), `${t.memberCount} ${t.memberCount === 1 ? 'person' : 'people'}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge>{t.baseCurrency}</Badge>
                {t.myRole === 'owner' && <Badge tone="brand">Owner</Badge>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JoinByLinkButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const token = extractInviteToken(value);
    if (!token) return setError('That doesn’t look like a ChickAA invite link');
    navigate(`/join/${token}`);
  };

  const paste = async () => {
    try {
      setValue(await navigator.clipboard.readText());
    } catch {
      /* permission denied: user can paste manually */
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" needsNetwork onClick={() => setOpen(true)}>
        🔗 Join a trip
      </Button>
    );
  }
  return (
    <div className="col-span-2">
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <TextField
            label="Paste the invite link"
            placeholder="https://…/join/…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(undefined);
            }}
            error={error}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="url"
          />
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={paste}>
              Paste
            </Button>
            <Button type="submit" disabled={!value}>
              Open
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
