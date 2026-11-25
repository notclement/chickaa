import { Link, Outlet } from 'react-router';
import { OfflineBanner } from '../offline/OfflineBanner.tsx';
import { BrandLockup } from './BrandLockup.tsx';
import { UpdateToast } from './UpdateToast.tsx';

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur supports-[backdrop-filter]:bg-cream/75">
        <div className="pt-safe px-safe pb-3">
          <div className="mx-auto flex max-w-xl items-center justify-between">
            <Link to="/" aria-label="NoChickenCall home" className="rounded-xl">
              <BrandLockup size="sm" />
            </Link>
          </div>
        </div>
        <OfflineBanner />
      </header>
      <main className="flex-1 px-safe pb-safe">
        <div className="mx-auto w-full max-w-xl">
          <Outlet />
        </div>
      </main>
      <UpdateToast />
    </div>
  );
}
