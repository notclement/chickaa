import {
  ChangePasswordRequest,
  LoginRequest,
  RecoverRequest,
  RegenerateRecoveryRequest,
  RegisterRequest,
  UpdateProfileRequest,
  type AuthWithRecoveryResponse,
  type MeResponse,
  type ReferralResponse,
  type SessionResponse,
} from '@ncc/contracts';
import { schema } from '@ncc/db';
import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { ACCOUNT_DISABLED_MESSAGE, ADMIN_USERNAME } from '@ncc/contracts';
import { burnVerifyTime, hashSecret, newRecoveryCode, sha256, verifySecret } from '../auth/crypto.ts';
import { currentUser, endSession, requireAuth, revokeOtherSessions, startSession } from '../auth/session.ts';
import { body, clientIp, HttpError, isUniqueViolation } from '../lib/http.ts';
import { rateLimit, rateLimitHit, rateLimitPeek, resetRateLimit } from '../lib/rateLimit.ts';
import type { Env } from '../lib/types.ts';
import { ensureReferralCode, publicUser, REFERRAL_CAP_MONTHS } from '../lib/users.ts';

const MIN = 60;

/** Constant-time comparison of the one-time admin setup code. */
function adminCodeMatches(expected: string | undefined, given: string | undefined): boolean {
  if (!expected || !given) return false;
  return timingSafeEqual(Buffer.from(sha256(expected), 'hex'), Buffer.from(sha256(given.trim()), 'hex'));
}

export const authRoutes = new Hono<Env>();

authRoutes.post('/register', async (c) => {
  const db = c.var.db;
  const ipKey = `register:ip:${clientIp(c)}`;
  // Only successful sign-ups count (test report U8): typos on shared hotel Wi-Fi don't lock a group out.
  await rateLimitPeek(db, ipKey, 50, 60 * MIN);
  const input = await body(c, RegisterRequest);

  // The reserved "admin" ID needs the one-time code from the server's environment (ADMIN_SETUP_CODE).
  const isAdmin = input.username === ADMIN_USERNAME;
  if (isAdmin) {
    await rateLimit(db, `admin-setup:ip:${clientIp(c)}`, 5, 60 * MIN);
    if (!adminCodeMatches(c.var.config.adminSetupCode, input.adminSetupCode)) {
      throw new HttpError(403, 'ADMIN_CODE', 'That ID is reserved', { fields: { username: 'That ID is reserved. Please pick another' } });
    }
  }

  const recovery = newRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashSecret(input.password),
    hashSecret(recovery.normalized),
  ]);

  // "Invite a friend": a valid code gives both people a month as Supporter.
  const code = input.referralCode?.toUpperCase();
  const [referrer] = code
    ? await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.referralCode, code)).limit(1)
    : [];

  let user;
  try {
    user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(schema.users)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          recoveryCodeHash,
          isAdmin,
          ...(referrer && { referredBy: referrer.id, supporterUntil: sql`now() + interval '1 month'` }),
        })
        .returning();
      if (referrer) {
        // +1 month from whichever is later, now or their current end; capped, and lifetime is untouched.
        await tx
          .update(schema.users)
          .set({
            supporterUntil: sql`least(greatest(coalesce(${schema.users.supporterUntil}, now()), now()) + interval '1 month', now() + ${sql.raw(`interval '${REFERRAL_CAP_MONTHS} months'`)})`,
          })
          .where(and(eq(schema.users.id, referrer.id), eq(schema.users.supporterLifetime, false)));
      }
      return u!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'USERNAME_TAKEN', 'That username is taken');
    throw err;
  }

  await rateLimitHit(db, ipKey, 60 * MIN);
  await startSession(c, user!.id);
  const res: AuthWithRecoveryResponse = { user: publicUser(user!), recoveryCode: recovery.display };
  return c.json(res, 201);
});

authRoutes.post('/login', async (c) => {
  const db = c.var.db;
  const input = await body(c, LoginRequest);
  // Per IP, per username+IP (so a stranger can't lock someone else out, test report B4), and a
  // generous per-username cap against distributed guessing.
  const ip = clientIp(c);
  await rateLimit(db, `login:ip:${ip}`, 30, 15 * MIN);
  await rateLimit(db, `login:user:${input.username}:ip:${ip}`, 8, 15 * MIN);
  await rateLimit(db, `login:user:${input.username}`, 100, 15 * MIN);

  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, input.username)).limit(1);
  if (!user) {
    await burnVerifyTime(input.password);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
  }
  if (!(await verifySecret(input.password, user.passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
  }

  await resetRateLimit(db, `login:user:${input.username}:ip:${ip}`);
  await startSession(c, user.id);
  const res: MeResponse = { user: publicUser(user) };
  return c.json(res);
});

authRoutes.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

/** The app calls this on start. Signed out is a normal answer, not an error. */
authRoutes.get('/session', (c) => {
  const res: SessionResponse = { user: c.var.user };
  return c.json(res);
});

/** My "Invite a friend" code (made on first use), and how many people joined with it. */
authRoutes.get('/me/referral', requireAuth, async (c) => {
  const db = c.var.db;
  const me = currentUser(c);
  const code = await ensureReferralCode(db, me.id);
  const [{ invited }] = (await db
    .select({ invited: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.referredBy, me.id))) as [{ invited: number }];
  const res: ReferralResponse = { code, invited, months: invited };
  return c.json(res);
});

authRoutes.get('/me', requireAuth, (c) => {
  const res: MeResponse = { user: currentUser(c) };
  return c.json(res);
});

authRoutes.patch('/me', requireAuth, async (c) => {
  const me = currentUser(c);
  const input = await body(c, UpdateProfileRequest);
  const [user] = await c.var.db
    .update(schema.users)
    .set({ displayName: input.displayName, updatedAt: new Date() })
    .where(eq(schema.users.id, me.id))
    .returning();
  return c.json({ user: publicUser(user!) } satisfies MeResponse);
});

/** Forgot password: username + recovery code → new password. Rotates the code and signs out other devices. */
authRoutes.post('/recover', async (c) => {
  const db = c.var.db;
  const input = await body(c, RecoverRequest);
  await rateLimit(db, `recover:ip:${clientIp(c)}`, 20, 60 * MIN);
  await rateLimit(db, `recover:user:${input.username}`, 5, 60 * MIN);

  const [user] = await db.select().from(schema.users).where(eq(schema.users.username, input.username)).limit(1);
  const ok = user ? await verifySecret(input.recoveryCode, user.recoveryCodeHash) : (await burnVerifyTime(input.recoveryCode), false);
  if (!user || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Username or recovery code is wrong');
  if (user.disabledAt) throw new HttpError(403, 'ACCOUNT_DISABLED', ACCOUNT_DISABLED_MESSAGE);

  const recovery = newRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashSecret(input.newPassword),
    hashSecret(recovery.normalized),
  ]);
  await db
    .update(schema.users)
    .set({ passwordHash, recoveryCodeHash, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await revokeOtherSessions(db, user.id, null);
  await startSession(c, user.id);

  const res: AuthWithRecoveryResponse = { user: publicUser(user), recoveryCode: recovery.display };
  return c.json(res);
});

authRoutes.post('/password', requireAuth, async (c) => {
  const db = c.var.db;
  const me = currentUser(c);
  await rateLimit(db, `password:user:${me.id}`, 10, 15 * MIN);
  const input = await body(c, ChangePasswordRequest);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  if (!user || !(await verifySecret(input.currentPassword, user.passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Current password is wrong');
  }
  await db
    .update(schema.users)
    .set({ passwordHash: await hashSecret(input.newPassword), updatedAt: new Date() })
    .where(eq(schema.users.id, me.id));
  await revokeOtherSessions(db, me.id, c.var.sessionId);
  return c.json({ ok: true });
});

authRoutes.post('/recovery-code', requireAuth, async (c) => {
  const db = c.var.db;
  const me = currentUser(c);
  await rateLimit(db, `password:user:${me.id}`, 10, 15 * MIN);
  const input = await body(c, RegenerateRecoveryRequest);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, me.id)).limit(1);
  if (!user || !(await verifySecret(input.password, user.passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Password is wrong');
  }
  const recovery = newRecoveryCode();
  await db
    .update(schema.users)
    .set({ recoveryCodeHash: await hashSecret(recovery.normalized), updatedAt: new Date() })
    .where(eq(schema.users.id, me.id));
  const res: AuthWithRecoveryResponse = { user: publicUser(user), recoveryCode: recovery.display };
  return c.json(res);
});
