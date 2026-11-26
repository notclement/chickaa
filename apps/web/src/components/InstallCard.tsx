import { useState } from 'react';
import { useInstallPrompt } from '../pwa/useInstallPrompt.ts';

const DISMISS_KEY = 'ncc.installCard.dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Install invitation.
 *  - Chrome/Edge/Android: one tap opens the native install dialog.
 *  - iOS: there is no install API, so we show the Share → Add to Home Screen steps.
 *  - Hidden once running as the installed app.
 */
export function InstallCard({ force = false }: { force?: boolean }) {
  const { mode, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (mode === 'installed' || mode === 'unavailable') return null;
  if (dismissed && !force) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: fine, just don't remember */
    }
  };

  return (
    <section aria-labelledby="install-title" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-ink-900/5">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tangerine-100 text-xl" aria-hidden>
          📲
        </div>
        <div className="flex-1">
          <h2 id="install-title" className="font-bold">
            Put ChickAA on your home screen
          </h2>
          <p className="mt-1 text-sm text-ink-700">Opens full-screen like a normal app, and works with no signal.</p>
        </div>
        {!force && (
          <button onClick={dismiss} aria-label="Dismiss" className="-mr-2 -mt-2 rounded-full p-2 text-ink-500">
            ✕
          </button>
        )}
      </div>

      {mode === 'prompt' && (
        <button
          onClick={() => void promptInstall()}
          className="mt-4 w-full rounded-2xl bg-tangerine-500 py-3.5 font-bold text-white active:bg-tangerine-600"
        >
          Install app
        </button>
      )}

      {(mode === 'ios-safari' || mode === 'ios-other') && (
        <ol className="mt-4 space-y-3 text-sm">
          <Step n={1}>
            Tap <ShareIcon /> <b>Share</b>
            {mode === 'ios-safari' ? ' in Safari’s toolbar' : ' in your browser’s menu'}
          </Step>
          <Step n={2}>
            Choose <b>Add to Home Screen</b> <span aria-hidden>➕</span>
          </Step>
          <Step n={3}>
            Tap <b>Add</b>, then open ChickAA from your home screen
          </Step>
        </ol>
      )}
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sun-300 text-xs font-extrabold">{n}</span>
      <span className="text-ink-700">{children}</span>
    </li>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline size-5 -translate-y-0.5 text-[#0a84ff]" aria-label="Share icon">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
