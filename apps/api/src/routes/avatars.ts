import { publicUser } from '../lib/users.ts';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, type MeResponse } from '@chickaa/contracts';
import { schema } from '@chickaa/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { currentUser, requireAuth } from '../auth/session.ts';
import { HttpError, notFound, uuidParam } from '../lib/http.ts';
import { rateLimit } from '../lib/rateLimit.ts';
import type { Env } from '../lib/types.ts';

const { users, tripMembers, trips } = schema;

/** Checks the file really is what it claims (magic bytes), not just the Content-Type header. */
export function sniffImage(buf: Uint8Array): (typeof AVATAR_TYPES)[number] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.slice(from, to));
  if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** /auth/me/avatar: upload or remove your own photo. The browser has already shrunk it to ~128 px. */
export const myAvatarRoutes = new Hono<Env>();
myAvatarRoutes.use('*', requireAuth);

myAvatarRoutes.put('/', async (c) => {
  const me = currentUser(c);
  await rateLimit(c.var.db, `avatar:user:${me.id}`, 30, 60 * 60);
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > AVATAR_MAX_BYTES) {
    c.header('Connection', 'close'); // body left unread (B6)
    throw new HttpError(413, 'TOO_LARGE', 'That photo is too big');
  }
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length === 0) throw new HttpError(400, 'VALIDATION', 'No photo received');
  if (buf.length > AVATAR_MAX_BYTES) throw new HttpError(413, 'TOO_LARGE', 'That photo is too big');
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'UNSUPPORTED', 'Photos must be JPEG or WebP');

  const [u] = await c.var.db
    .update(users)
    .set({ avatar: Buffer.from(buf), avatarType: type, avatarVersion: sql`coalesce(${users.avatarVersion}, 0) + 1`, updatedAt: new Date() })
    .where(eq(users.id, me.id))
    .returning();
  const res: MeResponse = { user: publicUser(u!) };
  return c.json(res);
});

myAvatarRoutes.delete('/', async (c) => {
  const me = currentUser(c);
  const [u] = await c.var.db
    .update(users)
    .set({ avatar: null, avatarType: null, avatarVersion: null, updatedAt: new Date() })
    .where(eq(users.id, me.id))
    .returning();
  const res: MeResponse = { user: publicUser(u!) };
  return c.json(res);
});

/**
 * /users/:id/avatar?v=N: only you and people you share a trip with can see your photo.
 * The URL changes whenever the photo changes, so the browser may cache it for a year.
 */
export const avatarRoutes = new Hono<Env>();
avatarRoutes.use('*', requireAuth);

avatarRoutes.get('/:id/avatar', async (c) => {
  const me = currentUser(c);
  const id = uuidParam(c, 'id');
  const db = c.var.db;
  if (id !== me.id && !me.isAdmin) {
    const mine = db
      .select({ tripId: tripMembers.tripId })
      .from(tripMembers)
      .innerJoin(trips, eq(trips.id, tripMembers.tripId))
      .where(and(eq(tripMembers.userId, me.id), isNull(tripMembers.leftAt), isNull(trips.deletedAt)));
    const [shared] = await db
      .select({ one: sql`1` })
      .from(tripMembers)
      .where(and(eq(tripMembers.userId, id), sql`${tripMembers.tripId} in ${mine}`))
      .limit(1);
    if (!shared) throw notFound();
  }
  const [u] = await db.select({ avatar: users.avatar, type: users.avatarType }).from(users).where(eq(users.id, id)).limit(1);
  if (!u?.avatar || !u.type) throw notFound();
  return c.body(new Uint8Array(u.avatar), 200, {
    'Content-Type': u.type,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Content-Disposition': 'inline',
  });
});
