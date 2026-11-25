/**
 * Ask the browser not to evict our storage (the read-only offline copy).
 * Granted silently for installed apps on most browsers; harmless if refused.
 */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  try {
    if (!navigator.storage?.persist) return undefined;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return undefined;
  }
}
