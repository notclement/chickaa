import { useEffect, useState } from 'react';
import { useAppUpdate } from '../pwa/useAppUpdate.ts';
import { useHasUnsavedChanges } from '../pwa/unsavedChanges.ts';

/**
 * "New version ready · Refresh". Held back while a form has unsaved input so an
 * update never wipes a half-typed expense (ARCHITECTURE.md §3.4).
 */
export function UpdateToast() {
  const { needRefresh, offlineReady, applyUpdate, dismissUpdate, dismissOfflineReady } = useAppUpdate();
  const busy = useHasUnsavedChanges();
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(dismissOfflineReady, 4000);
    return () => window.clearTimeout(t);
  }, [offlineReady, dismissOfflineReady]);

  if (needRefresh && !busy) {
    return (
      <Toast>
        <span className="font-semibold">New version ready</span>
        <div className="ml-auto flex gap-2">
          <button onClick={dismissUpdate} className="rounded-full px-3 py-2 text-cream/70 hover:text-cream">
            Later
          </button>
          <button
            onClick={() => {
              setUpdating(true);
              void applyUpdate();
            }}
            disabled={updating}
            className="rounded-full bg-tangerine-500 px-4 py-2 font-bold text-white disabled:opacity-60"
          >
            {updating ? 'Updating…' : 'Refresh'}
          </button>
        </div>
      </Toast>
    );
  }

  if (offlineReady) {
    return (
      <Toast>
        <span>✓ Ready to open without internet</span>
      </Toast>
    );
  }
  return null;
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-safe z-50 flex justify-center px-safe">
      <div
        role="status"
        aria-live="polite"
        className="animate-slide-up pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-cream shadow-xl"
      >
        {children}
      </div>
    </div>
  );
}
