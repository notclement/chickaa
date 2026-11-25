import { Link, Outlet } from 'react-router';
import { useServerWaking } from '../api/serverStatus.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { OfflineBanner } from '../offline/OfflineBanner.tsx';
import { Avatar } from '../ui/index.tsx';
import { BrandLockup } from './BrandLockup.tsx';
import { UpdateToast } from './UpdateToast.tsx';

export function AppShell() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75">
        <div className="pt-safe px-safe pb-3">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <Link to="/" aria-label="NoChickenCall home" className="rounded-xl">
              <BrandLockup size="sm" />
            </Link>
            {user && (
              <Link to="/account" aria-label="Account" className="rounded-full">
                <Avatar name={user.displayName} id={user.id} size="sm" />
              </Link>
            )}
          </div>
        </div>
        <OfflineBanner />
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
