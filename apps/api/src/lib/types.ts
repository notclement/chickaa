import type { Db } from '@ncc/db';
import type { Config } from '../config.ts';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface Env {
  Variables: {
    db: Db;
    config: Config;
    user: AuthUser | null;
    sessionId: string | null;
  };
}
