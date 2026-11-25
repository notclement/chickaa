import type { SessionResponse, User } from '@ncc/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, post } from '../api/client.ts';
import { registerAvatars } from '../lib/avatars.ts';

type Status = 'loading' | 'authed' | 'anon' | 'unreachable';

interface AuthState {
  status: Status;
  user: User | null;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

/** Clears anything this app stored on the device for the signed-in user. */
export async function clearLocalUserData(): Promise<void> {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ncc.user.')) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
  // Phase 7: also deletes the per-user IndexedDB cache here.
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUserState] = useState<User | null>(null);

  const setUser = useCallback((u: User | null) => {
    if (u) registerAvatars([u]);
    setUserState(u);
    setStatus(u ? 'authed' : 'anon');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api<SessionResponse>('/auth/session');
      setUser(res.user);
    } catch {
      setStatus('unreachable');
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => {});
    await clearLocalUserData();
    setUser(null);
  }, [setUser]);

  useEffect(() => {
    void refresh();
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
