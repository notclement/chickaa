import { useSyncExternalStore } from 'react';

/**
 * Remembers when the offline copies shown on the current screen were saved, so the banner can
 * say "Last updated 3:42 pm". Reset on every navigation.
 */
let oldest: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const staleness = {
  servedFromCache(savedAt: number) {
    if (oldest === null || savedAt < oldest) {
      oldest = savedAt;
      emit();
    }
  },
  reset() {
    if (oldest !== null) {
      oldest = null;
      queueMicrotask(emit);
    }
  },
};

export function useLastUpdated(): Date | undefined {
  const v = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => oldest,
  );
  return v === null ? undefined : new Date(v);
}
