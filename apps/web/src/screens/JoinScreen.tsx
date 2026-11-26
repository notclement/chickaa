import type { InvitePreview, JoinResponse } from '@ncc/contracts';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, errorMessage, post } from '../api/client.ts';
import { useApi } from '../api/useApi.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { isIOS, isStandalone, readPlatform } from '../pwa/platform.ts';
import { Button, ButtonLink, Card, ErrorState, FormError, Loading } from '../ui/index.tsx';

const REASONS: Record<Exclude<InvitePreview['reason'], 'ok'>, string> = {
  not_found: 'This invite link isn’t valid. Ask whoever sent it for a new one.',
  revoked: 'This invite link was switched off. Ask for a new one.',
  expired: 'This invite link has expired. Ask for a new one.',
  used_up: 'This invite link has already been used the maximum number of times.',
  trip_closed: 'This trip is no longer taking new members.',
};

export function JoinScreen() {
  const { token = '' } = useParams();
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const preview = useApi(() => api<InvitePreview>(`/invites/${encodeURIComponent(token)}`), [token, user?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [joinedTripId, setJoinedTripId] = useState<string | null>(null);

  if (preview.error) return <ErrorState message={errorMessage(preview.error)} onRetry={preview.reload} />;
  if (!preview.data || status === 'loading') return <Loading label="Opening invite…" />;
  const p = preview.data;
  const next = encodeURIComponent(`/join/${token}`);

  const join = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await post<JoinResponse>(`/invites/${encodeURIComponent(token)}/join`);
      const platform = readPlatform();
      // iOS opens invite links in Safari, not the installed app: suggest the home-screen app.
      if (isIOS(platform) && !isStandalone(platform)) setJoinedTripId(res.tripId);
      else navigate(`/trips/${res.tripId}`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  if (joinedTripId) {
    return (
      <div className="space-y-4 pt-4">
        <Card className="text-center">
          <div className="text-4xl" aria-hidden>
            🎉
          </div>
          <h1 className="mt-2 text-xl font-extrabold">You’re in {p.trip?.name}!</h1>
          <p className="mt-1 text-ink-700">If you use ChickAA from your home screen, open it there. The trip will be waiting.</p>
          <ButtonLink to={`/trips/${joinedTripId}`} block>
            Go to the trip
          </ButtonLink>
        </Card>
        <InstallCard force />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <Card className="text-center">
        <div className="text-5xl" aria-hidden>
          {p.valid ? '✈️' : '🙈'}
        </div>
        {p.trip ? (
          <>
            <p className="mt-3 text-sm font-semibold text-ink-500">{p.trip.ownerName} invited you to</p>
            <h1 className="mt-1 text-2xl font-extrabold">{p.trip.name}</h1>
            <p className="mt-1 text-sm text-ink-500">
              {p.trip.memberCount} {p.trip.memberCount === 1 ? 'person' : 'people'} · amounts in {p.trip.baseCurrency}
            </p>
          </>
        ) : (
          <h1 className="mt-3 text-xl font-extrabold">Invite not found</h1>
        )}

        {p.alreadyMember ? (
          <div className="mt-5 space-y-2">
            <p className="text-sm font-semibold text-owed">You’re already in this trip.</p>
            <ButtonLink to={`/trips/${p.trip!.id}`} block>
              Open trip
            </ButtonLink>
          </div>
        ) : !p.valid ? (
          <p className="mt-4 text-ink-700">{REASONS[p.reason as Exclude<InvitePreview['reason'], 'ok'>]}</p>
        ) : status === 'authed' ? (
          <div className="mt-5 space-y-3">
            <FormError message={error} />
            <Button block loading={busy} onClick={join}>
              Join as {user!.displayName}
            </Button>
          </div>
        ) : (
          <div className="mt-5 grid gap-2">
            <ButtonLink to={`/register?next=${next}`} block>
              Create account to join
            </ButtonLink>
            <ButtonLink to={`/login?next=${next}`} variant="secondary" block>
              I already have an account
            </ButtonLink>
          </div>
        )}
      </Card>
    </div>
  );
}
