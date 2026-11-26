import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

const MONTH = 28 * 24 * 3600 * 1000; // at least this much
const until = (u: { supporter: { until: string | null } }) => new Date(u.supporter.until!).getTime() - Date.now();

describe.skipIf(!TEST_DB_URL)('supporter + invite a friend', () => {
  beforeEach(resetDb);

  it('new users are not supporters; a referral gives both people a month', async () => {
    const { app } = await testApp();
    const alice = await registered(app, 'alice');
    const me = (await alice.c.get('/auth/me')).body.user;
    expect(me.supporter).toEqual({ active: false, lifetime: false, until: null });

    const ref = (await alice.c.get('/auth/me/referral')).body;
    expect(ref.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await alice.c.get('/auth/me/referral')).body.code).toBe(ref.code); // stable

    const bob = client(app, '198.51.100.71');
    const res = await bob.post('/auth/register', { username: 'bob', password: 'correct horse battery', displayName: 'Bob', referralCode: ref.code.toLowerCase() });
    expect(res.status).toBe(201);
    expect(res.body.user.supporter.active).toBe(true);
    expect(until(res.body.user)).toBeGreaterThan(MONTH);

    const a = (await alice.c.get('/auth/me')).body.user;
    expect(a.supporter.active).toBe(true);
    expect(until(a)).toBeGreaterThan(MONTH);
    expect((await alice.c.get('/auth/me/referral')).body).toMatchObject({ invited: 1, months: 1 });

    // A second friend stacks another month for Alice.
    await client(app, '198.51.100.72').post('/auth/register', { username: 'carol', password: 'correct horse battery', displayName: 'C', referralCode: ref.code });
    expect(until((await alice.c.get('/auth/me')).body.user)).toBeGreaterThan(2 * MONTH);

    // Unknown codes are ignored, not an error.
    const dave = await client(app, '198.51.100.73').post('/auth/register', { username: 'dave', password: 'correct horse battery', displayName: 'D', referralCode: 'NOPE1234' });
    expect(dave.status).toBe(201);
    expect(dave.body.user.supporter.active).toBe(false);
  });

  it('referral months are capped at 12 ahead', async () => {
    const { app, db } = await testApp();
    const alice = await registered(app, 'alice');
    const { code } = (await alice.c.get('/auth/me/referral')).body;
    await db.execute(sql`update users set supporter_until = now() + interval '12 months' where username = 'alice'`);
    await client(app, '198.51.100.74').post('/auth/register', { username: 'bob', password: 'correct horse battery', displayName: 'B', referralCode: code });
    expect(until((await alice.c.get('/auth/me')).body.user)).toBeLessThan(366 * 24 * 3600 * 1000);
  });

  it('admin can give a month, lifetime, or remove it; others cannot', async () => {
    const { app } = await testApp();
    const admin = client(app, '198.51.100.200');
    await admin.post('/auth/register', { username: 'admin', password: 'correct horse battery', displayName: 'Admin', adminSetupCode: 'correct-admin-code-123' });
    const bob = await registered(app, 'bob');
    const url = `/admin/users/${bob.user.id}/supporter`;

    expect((await bob.c.post(url, { action: 'lifetime' })).status).toBe(404);
    const month = (await admin.post(url, { action: 'month' })).body.supporter;
    expect(month).toMatchObject({ active: true, lifetime: false });
    expect(until({ supporter: month })).toBeGreaterThan(MONTH);
    expect((await admin.post(url, { action: 'lifetime' })).body.supporter).toMatchObject({ active: true, lifetime: true });
    expect((await bob.c.get('/auth/me')).body.user.supporter.lifetime).toBe(true);

    const listed = (await admin.get('/admin/users')).body.users.find((u: { username: string }) => u.username === 'bob');
    expect(listed).toMatchObject({ supporter: { active: true, lifetime: true }, referredBy: null, invited: 0 });

    expect((await admin.post(url, { action: 'remove' })).body.supporter).toEqual({ active: false, lifetime: false, until: null });
    expect((await admin.post(url, { action: 'forever' })).status).toBe(400);
    expect((await admin.post(`/admin/users/${crypto.randomUUID()}/supporter`, { action: 'month' })).status).toBe(404);
  });
});
