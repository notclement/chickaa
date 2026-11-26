import { schema } from '@ncc/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

describe.skipIf(!TEST_DB_URL)('auth', () => {
  beforeEach(resetDb);

  it('registers without email/phone, returns a one-time recovery code and logs in', async () => {
    const { app, db } = await testApp();
    const c = client(app);
    const res = await c.post('/auth/register', { username: 'Alice', password: 'correct horse battery', displayName: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'alice', displayName: 'Alice' });
    expect(res.body.recoveryCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.setCookie).toMatch(/^__Host-ncc_session=.+HttpOnly/i);
    expect(res.setCookie).toMatch(/Secure/);
    expect(res.setCookie).toMatch(/SameSite=Lax/);

    const me = await c.get('/auth/me');
    expect(me.body.user.username).toBe('alice');

    // Secrets are stored as Argon2id hashes, never in plain text.
    const [row] = await db.select().from(schema.users);
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row!.recoveryCodeHash).toMatch(/^\$argon2id\$/);
    expect(row!.passwordHash).not.toContain('correct horse');
    const [session] = await db.select().from(schema.sessions);
    expect(c.cookie).not.toContain(session!.tokenHash);
  });

  it('rejects duplicate usernames, case-insensitively', async () => {
    const { app } = await testApp();
    await registered(app, 'bob');
    const res = await client(app).post('/auth/register', { username: 'BOB', password: 'another password', displayName: 'B' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('validates input with readable messages', async () => {
    const { app } = await testApp();
    const res = await client(app).post('/auth/register', { username: 'a!', password: 'short', displayName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields).toHaveProperty('username');
    expect(res.body.error.details.fields).toHaveProperty('password');
    expect(res.body.error.details.fields).toHaveProperty('displayName');
  });

  it('logs in and out; wrong password and unknown user look the same', async () => {
    const { app } = await testApp();
    await registered(app, 'carol');
    const c = client(app);
    const wrong = await c.post('/auth/login', { username: 'carol', password: 'nope nope nope' });
    const unknown = await c.post('/auth/login', { username: 'nobody', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);

    const ok = await c.post('/auth/login', { username: 'Carol', password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(200);

    const sessionCookie = c.cookie;
    await c.post('/auth/logout');
    expect((await c.get('/auth/me')).status).toBe(401);

    // The old cookie is dead server-side too (not just deleted from the browser).
    const replay = await app.request('/api/v1/auth/me', { headers: { cookie: sessionCookie } });
    expect(replay.status).toBe(401);
  });

  it('rate-limits repeated failed logins from one device, without locking the real owner out (B4)', async () => {
    const { app } = await testApp();
    await registered(app, 'dave');
    let last;
    for (let i = 0; i < 9; i++) last = await client(app, '198.51.100.9').post('/auth/login', { username: 'dave', password: 'wrong wrong' });
    expect(last!.status).toBe(429);
    expect(last!.body.error.code).toBe('RATE_LIMITED');
    // The attacker's attempts don't block Dave on his own phone.
    const real = await client(app, '203.0.113.200').post('/auth/login', { username: 'dave', password: 'correct horse battery' });
    expect(real.status).toBe(200);
  });

  it('recovers a forgotten password with the recovery code, rotating it and signing out other devices', async () => {
    const { app } = await testApp();
    const { c: phone, recoveryCode } = await registered(app, 'erin');

    const laptop = client(app);
    const bad = await laptop.post('/auth/recover', { username: 'erin', recoveryCode: 'AAAA-AAAA-AAAA-AAAA', newPassword: 'brand new password' });
    expect(bad.status).toBe(401);

    const ok = await laptop.post('/auth/recover', {
      username: 'erin',
      recoveryCode: recoveryCode.toLowerCase().replaceAll('-', ' '), // forgiving about case/spacing
      newPassword: 'brand new password',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCode).not.toBe(recoveryCode);
    expect((await laptop.get('/auth/me')).status).toBe(200);
    expect((await phone.get('/auth/me')).status).toBe(401);

    // Old code no longer works; new password does.
    const reuse = await client(app).post('/auth/recover', { username: 'erin', recoveryCode, newPassword: 'another one here' });
    expect(reuse.status).toBe(401);
    expect((await client(app).post('/auth/login', { username: 'erin', password: 'brand new password' })).status).toBe(200);
  });

  it('changes password (needs current one) and regenerates the recovery code', async () => {
    const { app } = await testApp();
    const { c, recoveryCode } = await registered(app, 'frank');
    expect((await c.post('/auth/password', { currentPassword: 'wrong', newPassword: 'new password 123' })).status).toBe(401);
    expect((await c.post('/auth/password', { currentPassword: 'correct horse battery', newPassword: 'new password 123' })).status).toBe(200);
    expect((await c.get('/auth/me')).status).toBe(200); // current device stays signed in

    const regen = await c.post('/auth/recovery-code', { password: 'new password 123' });
    expect(regen.status).toBe(200);
    expect(regen.body.recoveryCode).not.toBe(recoveryCode);
  });

  it('updates the display name', async () => {
    const { app } = await testApp();
    const { c } = await registered(app, 'gina');
    const res = await c.patch('/auth/me', { displayName: 'Gina 🌴' });
    expect(res.body.user.displayName).toBe('Gina 🌴');
  });

  it('reports the session without erroring when signed out', async () => {
    const { app } = await testApp();
    expect((await client(app).get('/auth/session')).body).toEqual({ user: null });
    const { c } = await registered(app, 'hank');
    expect((await c.get('/auth/session')).body.user.username).toBe('hank');
  });

  it('requires login for protected routes', async () => {
    const { app } = await testApp();
    const res = await client(app).get('/trips');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
