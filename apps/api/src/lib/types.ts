import type { Db } from '@ncc/db';
import type { Config } from '../config.ts';
import type { FxProvider } from '../fx/provider.ts';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarVersion: number | null;
  isAdmin: boolean;
  supporter: { active: boolean; lifetime: boolean; until: string | null };
  disabled: boolean;
}

export interface Env {
  Variables: {
    db: Db;
    config: Config;
    fx: FxProvider;
    user: AuthUser | null;
    sessionId: string | null;
  };
}
