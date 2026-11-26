/**
 * Read-only offline copy of what the app has loaded (Phase 7, ARCHITECTURE.md §4).
 *
 * - One IndexedDB database per user (`chickaa-<userId>`), deleted on logout or when someone
 *   else logs in on the device. Nothing here is a source of truth; the server always wins.
 * - Only GET responses for trip data are kept (trips, members, expenses, balances, settle-up).
 * - The service worker never caches API responses, so this is the only offline data store.
 */
const STORE = 'responses';
const CACHEABLE = [
  /^\/trips$/,
  /^\/trips\/[0-9a-f-]{36}$/,
  /^\/trips\/[0-9a-f-]{36}\/(expenses|balances|settlement|fx-rates)$/,
  /^\/expenses\/[0-9a-f-]{36}(\/revisions)?$/,
];

let userId: string | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

export const dbName = (uid: string) => `chickaa-${uid}`;

export function isCacheable(path: string): boolean {
  const p = path.split('?')[0]!;
  return CACHEABLE.some((re) => re.test(p));
}

function open(uid: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName(uid), 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'path' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private mode / storage disabled: offline viewing just isn't available
    }
  });
}

/** Called by the auth layer whenever the signed-in user is known (or null after logout). */
export function setCacheUser(uid: string | null): void {
  if (uid === userId) return;
  void dbPromise?.then((db) => db?.close());
  userId = uid;
  dbPromise = uid ? open(uid) : null;
}

export interface Cached<T> {
  data: T;
  savedAt: number;
}

export async function cachePut(path: string, data: unknown): Promise<void> {
  const db = await dbPromise;
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ path, data, savedAt: Date.now() });
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheGet<T>(path: string): Promise<Cached<T> | null> {
  const db = await dbPromise;
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(path);
      req.onsuccess = () => resolve((req.result as Cached<T> | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Deletes a user's offline copy (logout, or a different user signing in on this device). */
export async function deleteUserCache(uid: string): Promise<void> {
  if (uid === userId) {
    const db = await dbPromise;
    db?.close();
    userId = null;
    dbPromise = null;
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(dbName(uid));
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}
