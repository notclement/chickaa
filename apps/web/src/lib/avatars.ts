import { useSyncExternalStore } from 'react';

/**
 * Who has a profile photo, and which version. Filled from whatever the app has loaded
 * (me, trip members) so any <Avatar> can show the photo without extra requests.
 */
const versions = new Map<string, number | null>();
const listeners = new Set<() => void>();
let snapshot = 0;

export function registerAvatars(list: { id: string; avatarVersion: number | null }[]) {
  let changed = false;
  for (const u of list) {
    if (versions.get(u.id) !== u.avatarVersion) {
      versions.set(u.id, u.avatarVersion);
      changed = true;
    }
  }
  if (changed) {
    snapshot++;
    listeners.forEach((l) => l());
  }
}

export function useAvatarUrl(userId: string): string | null {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
  const v = versions.get(userId);
  return v ? `/api/v1/users/${userId}/avatar?v=${v}` : null;
}
