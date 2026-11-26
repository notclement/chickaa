import { SUPPORT_TELEGRAM } from '@chickaa/contracts';
import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useServerWaking } from '../api/serverStatus.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { OfflineBanner } from '../offline/OfflineBanner.tsx';
import { staleness, useLastUpdated } from '../offline/staleness.ts';
import { Avatar } from '../ui/index.tsx';
import { BrandLockup } from './BrandLockup.tsx';
import { UpdateToast } from './UpdateToast.tsx';

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  // New screen → forget the previous screen's "last updated" time (runs before child effects).
  useMemo(() => staleness.reset(), [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastUpdated = useLastUpdated();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75">
        <div className="pt-safe px-safe pb-3">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <Link to="/" aria-label="ChickAA home" className="rounded-xl">
              <BrandLockup size="sm" />
            </Link>
            {user && (
              <div className="flex items-center gap-2">
                {user.isAdmin && (
                  <Link to="/admin" aria-label="Admin: all trips" className="grid size-9 place-items-center rounded-full bg-ink-900 text-sm text-cream">
                    🛡️
                  </Link>
                )}
                <Link to="/account" aria-label="Account" className="rounded-full">
                  <Avatar name={user.displayName} id={user.id} size="sm" />
                </Link>
              </div>
            )}
          </div>
        </div>
        {user?.disabled && <DisabledBanner />}
        <OfflineBanner lastUpdated={lastUpdated} />
        <WakingBanner />
      </header>
      <main className="flex-1 px-safe pb-safe">
        <div className="mx-auto w-full max-w-xl pb-8">
          <Outlet />
        </div>
      </main>
      <UpdateToast />
    </div>
  );
}

/** Free hosting sleeps after 15 idle minutes; say so instead of looking frozen. */
function WakingBanner() {
  const waking = useServerWaking();
  if (!waking || !navigator.onLine) return null;
  return (
    <div role="status" className="bg-sun-300 px-safe py-2 text-sm text-ink-900">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2">
        <span aria-hidden className="inline-block size-3 animate-spin rounded-full border-2 border-ink-900 border-t-transparent" />
        <span>
          <b>Waking up the server…</b> can take up to a minute after a quiet spell.
        </span>
      </div>
    </div>
  );
}

/** Shown on every screen while the account is disabled. */
function DisabledBanner() {
  return (
    <div role="alert" className="bg-owes px-4 py-2.5 text-center text-sm font-semibold text-white" data-testid="disabled-banner">
      Account disabled. PM{' '}
      <a href={`https://t.me/${SUPPORT_TELEGRAM}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        @{SUPPORT_TELEGRAM}
      </a>{' '}
      on Telegram to figure out why. You can still view your trips.
    </div>
  );
}
