/** The "Invite a friend" code from a /r/<code> link, kept until sign-up (30 days). */
const KEY = 'ncc.ref';
const TTL_MS = 30 * 24 * 3600 * 1000;

export function saveReferral(code: string): void {
  const clean = code.trim().toUpperCase().slice(0, 32);
  if (!/^[A-Z0-9]+$/.test(clean)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, at: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

export function readReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > TTL_MS) return null;
    return code;
  } catch {
    return null;
  }
}

export function clearReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
