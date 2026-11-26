import { sql } from 'drizzle-orm';
import { schema } from '@chickaa/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { tripTag } from '../src/routes/admin.ts';
import { client, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

const CODE = 'correct-admin-code-123';

describe('tripTag', () => {
  const t = (o: Partial<{ status: string; deletedAt: Date | null; startDate: string | null; endDate: string | null }> = {}) => ({
    status: 'active',
    deletedAt: null,
    startDate: null,
    endDate: null,
    ...o,
  });
  const today = '2027-03-05';
  it.each([
    ['created, no expenses, no dates', t(), { expenseCount: 0, openTransfers: 0 }, 'active'],
    ['pre-trip (future dates)', t({ startDate: '2027-04-01', endDate: '2027-04-09' }), { expenseCount: 0, openTransfers: 0 }, 'active'],
    ['within the dates', t({ startDate: '2027-03-01', endDate: '2027-03-09' }), { expenseCount: 0, openTransfers: 0 }, 'ongoing'],
    ['has a transaction', t(), { expenseCount: 1, openTransfers: 0 }, 'ongoing'],
    ['end date passed, never finished', t({ startDate: '2027-02-01', endDate: '2027-02-09' }), { expenseCount: 3, openTransfers: 0 }, 'needs_finishing'],
    ['finished, payments open', t({ status: 'completed' }), { expenseCount: 3, openTransfers: 2 }, 'pending_settlement'],
    ['finished and settled', t({ status: 'completed' }), { expenseCount: 3, openTransfers: 0 }, 'ended'],
    ['deleted', t({ status: 'completed', deletedAt: new Date() }), { expenseCount: 3, openTransfers: 0 }, 'deleted'],
  ])('%s → %s', (_name, trip, stats, tag) => {
    expect(tripTag(trip, stats, today)).toBe(tag);
  });
});

describe.skipIf(!TEST_DB_URL)('admin', () => {
  beforeEach(resetDb);

  it('"admin" can only be created with the one-time setup code', async () => {
    const { app, db } = await testApp();
    const base = { username: 'admin', password: 'correct horse battery', displayName: 'Admin' };
    const noCode = await client(app).post('/auth/register', base);
    expect(noCode.status).toBe(403);
    expect(noCode.body.error.details.fields.username).toMatch(/reserved/);
    expect((await client(app).post('/auth/register', { ...base, adminSetupCode: 'guess' })).status).toBe(403);
    const ok = await client(app).post('/auth/register', { ...base, adminSetupCode: ` ${CODE} ` });
    expect(ok.status).toBe(201);
    expect(ok.body.user).toMatchObject({ username: 'admin', isAdmin: true });
    // Second attempt: the ID is taken, the code is useless now.
    expect((await client(app).post('/auth/register', { ...base, adminSetupCode: CODE })).status).toBe(409);
    const [row] = await db.select().from(schema.users);
    expect(row!.isAdmin).toBe(true);
  });

  it('look-alike admin IDs are refused for everyone', async () => {
    const { app } = await testApp();
    for (const username of ['adm1n', 'Administrator', 'a_d_m_i_n', 'amdin', 'r00t', 'sys4dmin', 'support', 'chickaa']) {
      const r = await client(app).post('/auth/register', { username, password: 'correct horse battery', displayName: 'X', adminSetupCode: CODE });
      expect(r.status, username).toBe(400);
      expect(r.body.error.details.fields.username).toMatch(/reserved/);
    }
    expect((await client(app).post('/auth/register', { username: 'badminton', password: 'correct horse battery', displayName: 'B' })).status).toBe(201);
  });

  it('admin sees every trip with a tag, can view any trip read-only, and cannot change it', async () => {
    const { app, db } = await testApp();
    const admin = client(app, '198.51.100.200');
    await admin.post('/auth/register', { username: 'admin', password: 'correct horse battery', displayName: 'Admin', adminSetupCode: CODE });
    const alice = await registered(app, 'alice');
    const bob = await registered(app, 'bob', '198.51.100.201');
    const t1 = (await alice.c.post('/trips', { name: 'Empty trip', baseCurrency: 'SGD' })).body;
    const t2 = (await alice.c.post('/trips', { name: 'Busy trip', baseCurrency: 'SGD' })).body;
    await alice.c.post(`/trips/${t2.id}/expenses`, {
      clientId: crypto.randomUUID(),
      description: 'Dinner',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '20',
      payers: [{ userId: alice.user.id, amount: '20' }],
      split: { type: 'equal', participants: [alice.user.id] },
    });
    const t3 = (await alice.c.post('/trips', { name: 'Gone', baseCurrency: 'SGD' })).body;
    await alice.c.call('DELETE', `/trips/${t3.id}`, { confirmName: 'Gone' });

    expect((await bob.c.get('/admin/trips')).status).toBe(404); // the admin area doesn't exist for others
    const list = (await admin.get('/admin/trips')).body;
    const tag = (id: string) => list.trips.find((t: { id: string }) => t.id === id).tag;
    expect(tag(t1.id)).toBe('active');
    expect(tag(t2.id)).toBe('ongoing');
    expect(tag(t3.id)).toBe('deleted');
    expect(list.trips.find((t: { id: string }) => t.id === t2.id)).toMatchObject({ ownerUsername: 'alice', expenseCount: 1, totalSpent: '2000', iAmMember: false });

    // Read-only views work…
    const view = await admin.get(`/trips/${t2.id}`);
    expect(view.status).toBe(200);
    expect(view.body.myRole).toBe('viewer');
    expect((await admin.get(`/trips/${t2.id}/expenses`)).body.expenses).toHaveLength(1);
    expect((await admin.get(`/trips/${t2.id}/balances`)).status).toBe(200);
    expect((await admin.get(`/trips/${t2.id}/settlement`)).status).toBe(200);
    expect((await admin.get(`/trips/${t3.id}`)).status).toBe(200); // even deleted trips
    // …but every change is refused.
    expect((await admin.post(`/trips/${t2.id}/complete`)).status).toBe(404);
    expect((await admin.patch(`/trips/${t2.id}`, { name: 'Hacked' })).status).toBe(404);
    expect(
      (
        await admin.post(`/trips/${t2.id}/expenses`, {
          clientId: crypto.randomUUID(),
          description: 'x',
          expenseDate: '2027-03-02',
          currency: 'SGD',
          amount: '1',
          payers: [{ userId: alice.user.id, amount: '1' }],
          split: { type: 'equal', participants: [alice.user.id] },
        })
      ).status,
    ).toBe(404);
    expect((await admin.get('/trips')).body.trips).toEqual([]); // My trips = only trips the admin belongs to

    // In a trip the admin joins, they're a normal member.
    const { token } = (await alice.c.post(`/trips/${t1.id}/invitations`, {})).body;
    await admin.post(`/invites/${token}/join`);
    expect((await admin.get(`/trips/${t1.id}`)).body.myRole).toBe('member');

    // Users tab: everyone, with the trips they own or belong to.
    expect((await bob.c.get('/admin/users')).status).toBe(404);
    const { users } = (await admin.get('/admin/users')).body;
    const find = (u: string) => users.find((x: { username: string }) => x.username === u);
    expect(find('bob')).toMatchObject({ displayName: 'BOB', isAdmin: false, trips: [] });
    expect(find('bob').lastSeenAt).not.toBeNull();
    expect(find('alice').trips.map((t: { name: string; tag: string; role: string }) => [t.name, t.tag, t.role])).toEqual([
      ['Gone', 'deleted', 'owner'],
      ['Busy trip', 'ongoing', 'owner'],
      ['Empty trip', 'active', 'owner'],
    ]);
    expect(find('admin')).toMatchObject({ isAdmin: true, trips: [{ name: 'Empty trip', role: 'member', left: false }] });

    // Permanent delete (test trips): any state, exact name, everything gone.
    await alice.c.post(`/trips/${t2.id}/complete`);
    expect((await bob.c.call('DELETE', `/admin/trips/${t2.id}`, { confirmName: 'Busy trip' })).status).toBe(404);
    expect((await admin.call('DELETE', `/admin/trips/${t2.id}`, { confirmName: 'busy' })).status).toBe(400);
    expect((await admin.call('DELETE', `/admin/trips/${t2.id}`, { confirmName: 'Busy trip' })).status).toBe(200);
    expect((await admin.call('DELETE', `/admin/trips/${t2.id}`, { confirmName: 'Busy trip' })).status).toBe(404);
    expect((await admin.get('/admin/trips')).body.trips.map((t: { id: string }) => t.id)).not.toContain(t2.id);
    expect((await alice.c.get(`/trips/${t2.id}`)).status).toBe(404);
    expect((await alice.c.get('/trips')).body.trips.map((t: { id: string }) => t.id)).not.toContain(t2.id);
    const left = await db.execute(sql`select
      (select count(*)::int from expenses where trip_id = ${t2.id}) as e,
      (select count(*)::int from settlements where trip_id = ${t2.id}) as s,
      (select count(*)::int from trip_members where trip_id = ${t2.id}) as m`);
    expect(left[0]).toEqual({ e: 0, s: 0, m: 0 });
    expect((await admin.call('DELETE', `/admin/trips/${t3.id}`, { confirmName: 'Gone' })).status).toBe(200); // soft-deleted ones too
  });
});
