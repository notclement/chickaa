import { useSyncExternalStore } from 'react';

/**
 * Tracks slow requests so we can show "Waking up the server…" instead of a frozen UI,
 * and pre-wakes the server when the app opens (ARCHITECTURE: Render free tier sleeps).
 */
const SLOW_AFTER_MS = 2500;
let slow = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const serverStatus = {
  /** Call when a request starts; call the returned function when it ends. */
  track(): () => void {
    let flagged = false;
    const timer = window.setTimeout(() => {
      flagged = true;
      slow++;
      emit();
    }, SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      if (flagged) {
        slow--;
        emit();
      }
    };
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  isWaking: () => slow > 0,
};

export function useServerWaking(): boolean {
  return useSyncExternalStore(serverStatus.subscribe, serverStatus.isWaking, () => false);
}

let lastWake = 0;
/**
 * Fire-and-forget request that wakes the server (and database) up, so it's ready by the
 * time the user taps Save. Throttled to once a minute.
 */
export function wakeServer(): void {
  if (!navigator.onLine || Date.now() - lastWake < 60_000) return;
  lastWake = Date.now();
  void fetch('/api/v1/health', { credentials: 'same-origin', cache: 'no-store' }).catch(() => {});
}

export function installWakeOnOpen(): void {
  wakeServer();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wakeServer();
  });
  window.addEventListener('online', wakeServer);
}
