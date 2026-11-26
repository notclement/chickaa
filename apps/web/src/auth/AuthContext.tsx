import type { SessionResponse, User } from '@ncc/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api/client.ts';
import { registerAvatars } from '../lib/avatars.ts';
import { deleteUserCache, setCacheUser } from '../offline/cache.ts';

/**
 * authed      signed in (server confirmed)
 * offline     no connection, but this device was last signed in as `user`: read-only offline mode
 * anon        signed out
 * unreachable no connection and nobody signed in on this device
 */
type Status = 'loading' | 'authed' | 'offline' | 'anon' | 'unreachable';

interface AuthState {
  status: Status;
  user: User | null;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Profile of whoever was last signed in here (no secrets; the session itself is an httpOnly cookie). */
const LAST_USER = 'ncc.user.last';
function readLastUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
function writeLastUser(u: User | null) {
  try {
    if (u) localStorage.setItem(LAST_USER, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER);
  } catch {
    /* storage unavailable */
  }
}

/** Clears everything this app stored on the device for the signed-in user. */
export async function clearLocalUserData(): Promise<void> {
  const last = readLastUser();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ncc.user.')) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  if (last) await deleteUserCache(last.id);
  setCacheUser(null);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);

  const setUser = useCallback((u: User | null) => {
    if (u) {
      const last = readLastUser();
      // Someone else signed in on this device: their predecessor's offline copy goes.
      if (last && last.id !== u.id) void deleteUserCache(last.id);
      registerAvatars([u]);
      writeLastUser(u);
      setCacheUser(u.id);
    }
    setUserState(u);
    setStatus(u ? 'authed' : 'anon');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<SessionResponse>('/auth/session');
      if (!res.user) {
        // Signed out (or the session expired) on the server: drop this device's copy too.
        if (readLastUser()) await clearLocalUserData();
        setUserState(null);
        setStatus('anon');
      } else setUser(res.user);
    } catch {
      const last = readLastUser();
      if (last) {
        setCacheUser(last.id);
        registerAvatars([last]);
        setUserState(last);
        setStatus('offline');
      } else setStatus('unreachable');
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    await clearLocalUserData();
    setUserState(null);
    setStatus('anon');
  }, []);

  useEffect(() => {
    void refresh();
    // Back online after starting offline: confirm the session with the server.
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refresh]);

  const value = useMemo(() => ({ status, user, setUser, refresh, logout }), [status, user, setUser, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function useMe(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useMe used on a signed-out screen');
  return user;
}

/** Signed in with an account the admin disabled: the app is read-only. Safe outside the provider. */
export function useAccountDisabled(): boolean {
  return !!useContext(Ctx)?.user?.disabled;
}
