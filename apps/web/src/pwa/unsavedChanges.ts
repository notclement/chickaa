/**
 * Tracks whether any form has unsaved input, so the update prompt can wait
 * instead of reloading the app under someone typing an expense.
 */
import { useEffect, useSyncExternalStore } from 'react';

const dirty = new Set<symbol>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const unsavedChanges = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  hasAny: () => dirty.size > 0,
};

/** Call in any form: `useUnsavedChanges(isDirty)`. */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const key = Symbol('form');
    dirty.add(key);
    emit();
    return () => {
      dirty.delete(key);
      emit();
    };
  }, [isDirty]);
}

export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(unsavedChanges.subscribe, unsavedChanges.hasAny, () => false);
}
