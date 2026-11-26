import { useOnline } from './useOnline.ts';

/**
 * Shown whenever the device is offline, with when the data on screen was last saved
 * ("Last updated 3:42 pm", or with the date if it's older than today).
 */
export function OfflineBanner({ lastUpdated }: { lastUpdated?: Date | undefined }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-ink-900 text-cream text-sm px-safe py-2">
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2">
        <span aria-hidden className="inline-block size-2 rounded-full bg-sun-400" />
        <span className="font-semibold">Offline · view only</span>
        {lastUpdated && (
          <span className="text-cream/70">
            · Last updated{' '}
            <span data-testid="last-updated">
              {lastUpdated.toDateString() === new Date().toDateString()
                ? lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : lastUpdated.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
