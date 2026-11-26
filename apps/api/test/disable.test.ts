import { beforeEach, describe, expect, it } from 'vitest';
import { client, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

describe.skipIf(!TEST_DB_URL)('disabled accounts', () => {
  beforeEach(resetDb);

  it('only when settled; read-only afterwards; blocks reopen and new expenses with them', async () => {
    const { app } = await testApp();
    const admin = client(app, '198.51.100.200');
    await admin.post('/auth/register', { username: 'admin', password: 'correct horse battery', displayName: 'Admin', adminSetupCode: 'correct-admin-code-123' });
    const alice = await registered(app, 'alice');
    const bob = await registered(app, 'bob', '198.51.100.81');
    const trip = (await alice.c.post('/trips', { name: 'Bali', baseCurrency: 'SGD' })).body;
    const { token } = (await alice.c.post(`/trips/${trip.id}/invitations`, {})).body;
    await bob.c.post(`/invites/${token}/join`);
    const expense = (aId: string, bId: string) => ({
      clientId: crypto.randomUUID(),
      description: 'Dinner',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '20',
      payers: [{ userId: aId, amount: '20' }],
      split: { type: 'equal', participants: [aId, bId] },
    });
    expect((await alice.c.post(`/trips/${trip.id}/expenses`, expense(alice.user.id, bob.user.id))).status).toBe(201);

    // Bob owes S$10: can't be disabled yet.
    const url = `/admin/users/${bob.user.id}/disable`;
    expect((await bob.c.post(url, {})).status).toBe(404);
    const blocked = await admin.post(url, { note: 'spam' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain('Bali (owes SGD 10.00)');

    // Settle up, then disabling works.
    const plan = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    const t = plan.transfers[0];
    await bob.c.post(`/settlements/${t.id}/sent`);
    await alice.c.post(`/settlements/${t.id}/confirm`);
    expect((await admin.post(url, { note: 'spam' })).status).toBe(200);
    const listed = (await admin.get('/admin/users')).body.users.find((u: { username: string }) => u.username === 'bob');
    expect(listed.disabledAt).not.toBeNull();
    expect(listed.disabledNote).toBe('spam');
    expect((await admin.post(`/admin/users/${(await admin.get('/auth/me')).body.user.id}/disable`, {})).status).toBe(400); // not the admin

    // Bob: can log in and look, nothing else.
    const me = (await bob.c.get('/auth/me')).body.user;
    expect(me.disabled).toBe(true);
    expect((await bob.c.get(`/trips/${trip.id}`)).status).toBe(200);
    for (const res of [
      await bob.c.post('/trips', { name: 'New', baseCurrency: 'SGD' }),
      await bob.c.patch('/auth/me', { displayName: 'Bobby' }),
      await bob.c.post('/auth/password', { currentPassword: 'correct horse battery', newPassword: 'another long pass' }),
      await bob.c.post(`/invites/${token}/join`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(res.body.error.message).toContain('@mashpotatas');
    }
    const relog = client(app, '198.51.100.82');
    expect((await relog.post('/auth/login', { username: 'bob', password: 'correct horse battery' })).body.user.disabled).toBe(true);
    expect((await bob.c.post('/auth/logout')).status).toBe(200);

    // Trip shows them as disabled; owner can't reopen.
    const detail = (await alice.c.get(`/trips/${trip.id}`)).body;
    expect(detail.members.find((m: { username: string }) => m.username === 'bob').disabled).toBe(true);
    const reopen = await alice.c.post(`/trips/${trip.id}/reopen`);
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.message).toBe('This trip can’t be reopened because BOB (@bob) has a disabled account. PM @mashpotatas on Telegram for more info.');

    // In another active trip, new expenses can't include them.
    const t2 = (await alice.c.post('/trips', { name: 'Tokyo', baseCurrency: 'SGD' })).body;
    expect((await alice.c.post(`/trips/${t2.id}/expenses`, expense(alice.user.id, bob.user.id))).status).toBe(409);

    // Enable again.
    expect((await admin.post(`/admin/users/${bob.user.id}/enable`)).status).toBe(200);
    expect((await alice.c.post(`/trips/${trip.id}/reopen`)).status).toBe(200);
  });
});
