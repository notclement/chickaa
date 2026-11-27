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
    // A second, still-open trip with Bob in it (for the "new expenses" check below).
    const t2 = (await alice.c.post('/trips', { name: 'Tokyo', baseCurrency: 'SGD' })).body;
    const inv2 = (await alice.c.post(`/trips/${t2.id}/invitations`, {})).body;
    expect((await bob.c.post(`/invites/${inv2.token}/join`)).status).toBe(200);

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
    const added = await alice.c.post(`/trips/${t2.id}/expenses`, expense(alice.user.id, bob.user.id));
    expect(added.status).toBe(409);
    expect(added.body.error.code).toBe('MEMBER_DISABLED');
    // …but one that leaves Bob out is fine.
    expect((await alice.c.post(`/trips/${t2.id}/expenses`, { ...expense(alice.user.id, alice.user.id), split: { type: 'equal', participants: [alice.user.id] } })).status).toBe(201);

    // Enable again.
    expect((await admin.post(`/admin/users/${bob.user.id}/enable`)).status).toBe(200);
    expect((await alice.c.post(`/trips/${trip.id}/reopen`)).status).toBe(200);
  });

  it('changes that would move a disabled person’s balance are refused; others are fine (run 3, F5/F6)', async () => {
    const { app } = await testApp();
    const admin = client(app, '198.51.100.201');
    await admin.post('/auth/register', { username: 'admin', password: 'correct horse battery', displayName: 'Admin', adminSetupCode: 'correct-admin-code-123' });
    const eve = await registered(app, 'eve');
    const dan = await registered(app, 'dan', '198.51.100.83');
    const trip = (await eve.c.post('/trips', { name: 'Penang', baseCurrency: 'SGD' })).body;
    const { token } = (await eve.c.post(`/trips/${trip.id}/invitations`, {})).body;
    await dan.c.post(`/invites/${token}/join`);
    const paidFor = (payer: string, other: string, description: string) => ({
      clientId: crypto.randomUUID(),
      description,
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '10',
      payers: [{ userId: payer, amount: '10' }],
      split: { type: 'exact', amounts: [{ userId: other, amount: '10' }] },
    });
    expect((await dan.c.post(`/trips/${trip.id}/expenses`, paidFor(dan.user.id, eve.user.id, 'Dan paid'))).status).toBe(201);
    const e2 = (await eve.c.post(`/trips/${trip.id}/expenses`, paidFor(eve.user.id, dan.user.id, 'Eve paid'))).body;
    expect((await admin.post(`/admin/users/${dan.user.id}/disable`, {})).status).toBe(200);

    // F6: a description-only edit is fine.
    const { clientId: _c, ...fields } = paidFor(eve.user.id, dan.user.id, 'Eve paid (lunch)');
    const renamed = await eve.c.put(`/expenses/${e2.id}`, { ...fields, version: e2.version });
    expect(renamed.status).toBe(200);
    // Changing Dan's share or deleting would move his balance: refused.
    const bigger = await eve.c.put(`/expenses/${e2.id}`, { ...fields, amount: '20', payers: [{ userId: eve.user.id, amount: '20' }], split: { type: 'exact', amounts: [{ userId: dan.user.id, amount: '20' }] }, version: renamed.body.version });
    expect(bigger.status).toBe(409);
    expect(bigger.body.error.code).toBe('MEMBER_DISABLED');
    const del = await eve.c.call('DELETE', `/expenses/${e2.id}?version=${renamed.body.version}`);
    expect(del.status).toBe(409);
    expect(del.body.error.message).toContain('@dan');
    const nets = (await eve.c.get(`/trips/${trip.id}/balances`)).body.balances.map((b: { net: string }) => b.net);
    expect(nets).toEqual(['0', '0']);
  });
});
