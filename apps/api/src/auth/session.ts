import { publicUser } from '../lib/users.ts';
import { schema, type Db } from '@chickaa/db';
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HttpError } from '../lib/http.ts';
import type { Env } from '../lib/types.ts';
import { randomToken, sha256 } from './crypto.ts';

/**
 * Cookie sessions (ARCHITECTURE.md §7): random token in an httpOnly cookie, only its
 * SHA-256 stored. 90-day sliding expiry so the installed app rarely asks to log in again.
 */
export const SESSION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function cookieName(c: Context<Env>): string {
  // __Host- prefix: Secure, path=/, no Domain → can't be set by subdomains. HTTPS only.
  return c.var.config.nodeEnv === 'production' ? '__Host-chickaa_session' : 'chickaa_session';
}

function writeCookie(c: Context<Env>, token: string) {
  const prod = c.var.config.nodeEnv === 'production';
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: prod,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function startSession(c: Context<Env>, userId: string): Promise<void> {
  const token = randomToken(32);
  const [row] = await c.var.db
    .insert(schema.sessions)
    .values({
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS),
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
    })
    .returning({ id: schema.sessions.id });
  writeCookie(c, token);
  c.set('sessionId', row!.id);
}

export async function endSession(c: Context<Env>): Promise<void> {
  if (c.var.sessionId) {
    await c.var.db
      .update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.sessions.id, c.var.sessionId));
  }
  deleteCookie(c, cookieName(c), { path: '/', secure: c.var.config.nodeEnv === 'production' });
  c.set('user', null);
  c.set('sessionId', null);
}

/** Revokes every session of a user except (optionally) the current one. */
export async function revokeOtherSessions(db: Db, userId: string, keepSessionId: string | null) {
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.revokedAt),
        keepSessionId ? ne(schema.sessions.id, keepSessionId) : undefined,
      ),
    );
}

/** Loads the user for every API request (or null). Slides expiry at most once a day. */
export const loadSession: MiddlewareHandler<Env> = async (c, next) => {
  c.set('user', null);
  c.set('sessionId', null);
  const token = getCookie(c, cookieName(c));
  if (token && token.length < 100) {
    const [row] = await c.var.db
      .select({
        sessionId: schema.sessions.id,
        lastSeenAt: schema.sessions.lastSeenAt,
        id: schema.users.id,
        username: schema.users.username,
        displayName: schema.users.displayName,
        avatarVersion: schema.users.avatarVersion,
        isAdmin: schema.users.isAdmin,
        supporterUntil: schema.users.supporterUntil,
        supporterLifetime: schema.users.supporterLifetime,
        disabledAt: schema.users.disabledAt,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(
        and(
          eq(schema.sessions.tokenHash, sha256(token)),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, sql`now()`),
        ),
      )
      .limit(1);

    if (row) {
      c.set('user', publicUser(row));
      c.set('sessionId', row.sessionId);
      if (Date.now() - row.lastSeenAt.getTime() > DAY_MS) {
        await c.var.db
          .update(schema.sessions)
          .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) })
          .where(eq(schema.sessions.id, row.sessionId));
        writeCookie(c, token);
      }
    }
  }
  await next();
};

export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  if (!c.var.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in');
  await next();
};

export function currentUser(c: Context<Env>) {
  const u = c.var.user;
  if (!u) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in');
  return u;
}
