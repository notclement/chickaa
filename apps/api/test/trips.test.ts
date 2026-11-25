import { schema } from '@ncc/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, ORIGIN, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

const BALI = { name: 'Bali 2027', baseCurrency: 'SGD', description: 'Beach + temples', startDate: '2027-03-01', endDate: '2027-03-07' };

describe.skipIf(!TEST_DB_URL)('trips', () => {
  beforeEach(resetDb);

  it('creates a trip; creator becomes owner and only member', async () => {
    const { app } = await testApp();
    const { c, user } = await registered(app, 'alice');
    const res = await c.post('/trips', BALI);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Bali 2027', baseCurrency: 'SGD', status: 'active', myRole: 'owner', memberCount: 1 });
    expect(res.body.members).toEqual([expect.objectContaining({ userId: user.id, role: 'owner', displayName: 'ALICE' })]);

    const list = await c.get('/trips');
    expect(list.body.trips).toHaveLength(1);
  });

  it('validates base currency and dates', async () => {
    const { app } = await testApp();
    const { c } = await registered(app, 'alice');
    expect((await c.post('/trips', { ...BALI, baseCurrency: 'XXX' })).status).toBe(400);
    const bad = await c.post('/trips', { ...BALI, startDate: '2027-03-09', endDate: '2027-03-01' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields.endDate).toBeTruthy();
  });

  it('hides trips from non-members (404, not 403) and ignores malformed ids', async () => {
    const { app } = await testApp();
    const { c } = await registered(app, 'alice');
    const { c: mallory } = await registered(app, 'mallory');
    const trip = (await c.post('/trips', BALI)).body;
    expect((await mallory.get(`/trips/${trip.id}`)).status).toBe(404);
    expect((await mallory.get('/trips')).body.trips).toEqual([]);
    expect((await c.get('/trips/not-a-uuid')).status).toBe(404);
  });

  it('lets only the owner edit trip settings; base currency locks once expenses exist', async () => {
    const { app, db } = await testApp();
    const { c, user } = await registered(app, 'alice');
    const trip = (await c.post('/trips', BALI)).body;
    const link = (await c.post(`/trips/${trip.id}/invitations`, {})).body;
    const { c: bob } = await registered(app, 'bob');
    await bob.post(`/invites/${link.token}/join`);

    expect((await bob.patch(`/trips/${trip.id}`, { name: 'Hijacked' })).status).toBe(403);
    const ok = await c.patch(`/trips/${trip.id}`, { name: 'Bali 🌴', baseCurrency: 'IDR' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Bali 🌴', baseCurrency: 'IDR' });

    await db.insert(schema.expenses).values({
      tripId: trip.id,
      clientId: crypto.randomUUID(),
      description: 'Dinner',
      originalAmount: 100n,
      originalCurrency: 'IDR',
      baseCurrency: 'IDR',
      exchangeRate: '1',
      rateSource: 'same_currency',
      rateDate: '2027-03-01',
      baseAmount: 100n,
      splitType: 'equal',
      expenseDate: '2027-03-01',
      createdBy: user.id,
      payloadHash: 'x',
    });
    const locked = await c.patch(`/trips/${trip.id}`, { baseCurrency: 'SGD' });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('TRIP_LOCKED');
  });
});

describe.skipIf(!TEST_DB_URL)('invitations', () => {
  beforeEach(resetDb);

  async function tripWithOwner() {
    const { app, db } = await testApp();
    const owner = await registered(app, 'alice');
    const trip = (await owner.c.post('/trips', BALI)).body;
    return { app, db, owner, trip };
  }

  it('creates a shareable link; only the hash is stored', async () => {
    const { db, owner, trip } = await tripWithOwner();
    const res = await owner.c.post(`/trips/${trip.id}/invitations`, { expiresInHours: 48, maxUses: 5 });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe(`${ORIGIN}/join/${res.body.token}`);
    expect(res.body.token.length).toBeGreaterThanOrEqual(32);
    expect(res.body.invitation).toMatchObject({ maxUses: 5, usageCount: 0, active: true });

    const [row] = await db.select().from(schema.invitations);
    expect(row!.tokenHash).not.toBe(res.body.token);
    expect(row!.tokenHash).toHaveLength(64);
  });

  it('full join flow: preview → register → join → member', async () => {
    const { app, owner, trip } = await tripWithOwner();
    const { token } = (await owner.c.post(`/trips/${trip.id}/invitations`, {})).body;

    const anon = client(app, '198.51.100.7');
    const preview = await anon.get(`/invites/${token}`);
    expect(preview.body).toMatchObject({
      valid: true,
      reason: 'ok',
      alreadyMember: false,
      trip: { name: 'Bali 2027', ownerName: 'ALICE', memberCount: 1, baseCurrency: 'SGD' },
    });
    expect((await anon.post(`/invites/${token}/join`)).status).toBe(401);

    const bob = await registered(app, 'bob');
    const joined = await bob.c.post(`/invites/${token}/join`);
    expect(joined.body).toEqual({ tripId: trip.id, alreadyMember: false });

    const t = (await bob.c.get(`/trips/${trip.id}`)).body;
    expect(t.myRole).toBe('member');
    expect(t.members.map((m: { username: string }) => m.username)).toEqual(['alice', 'bob']);
    expect((await bob.c.get(`/invites/${token}`)).body.alreadyMember).toBe(true);
  });

  it('prevents duplicate membership and does not burn a use on re-join', async () => {
    const { app, owner, trip } = await tripWithOwner();
    const { token } = (await owner.c.post(`/trips/${trip.id}/invitations`, { maxUses: 2 })).body;
    const bob = await registered(app, 'bob');
    await bob.c.post(`/invites/${token}/join`);
    const again = await bob.c.post(`/invites/${token}/join`);
    expect(again.body.alreadyMember).toBe(true);
    const owned = await owner.c.post(`/invites/${token}/join`);
    expect(owned.body.alreadyMember).toBe(true);

    const invs = (await owner.c.get(`/trips/${trip.id}/invitations`)).body.invitations;
    expect(invs[0].usageCount).toBe(1);
    expect((await owner.c.get(`/trips/${trip.id}`)).body.memberCount).toBe(2);
  });

  it('enforces max uses, even under concurrent joins', async () => {
    const { app, owner, trip } = await tripWithOwner();
    const { token } = (await owner.c.post(`/trips/${trip.id}/invitations`, { maxUses: 1 })).body;
    const people = await Promise.all(['bea', 'ben', 'bev'].map((n, i) => registered(app, n, `198.51.100.${20 + i}`)));
    const results = await Promise.all(people.map((p) => p.c.post(`/invites/${token}/join`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 410)).toHaveLength(2);
    expect((await owner.c.get(`/trips/${trip.id}`)).body.memberCount).toBe(2);
    expect((await client(app).get(`/invites/${token}`)).body.reason).toBe('used_up');
  });

  it('expired, revoked and unknown links are refused with a clear reason', async () => {
    const { app, db, owner, trip } = await tripWithOwner();
    const a = (await owner.c.post(`/trips/${trip.id}/invitations`, {})).body;
    const b = (await owner.c.post(`/trips/${trip.id}/invitations`, { expiresInHours: 1 })).body;
    const bob = await registered(app, 'bob');

    expect((await owner.c.del(`/invitations/${a.invitation.id}`)).body.invitation.active).toBe(false);
    const revoked = await bob.c.post(`/invites/${a.token}/join`);
    expect(revoked.status).toBe(410);
    expect(revoked.body.error.details.reason).toBe('revoked');

    await db.update(schema.invitations).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await bob.c.get(`/invites/${b.token}`)).body.reason).toBe('expired');
    expect((await bob.c.post(`/invites/${b.token}/join`)).status).toBe(410);

    const unknown = await bob.c.get('/invites/definitely-not-a-real-token');
    expect(unknown.body).toMatchObject({ valid: false, reason: 'not_found', trip: null });
    expect((await bob.c.post('/invites/definitely-not-a-real-token/join')).status).toBe(404);
  });

  it('only the owner can create, list or revoke links', async () => {
    const { app, owner, trip } = await tripWithOwner();
    const { token, invitation } = (await owner.c.post(`/trips/${trip.id}/invitations`, {})).body;
    const bob = await registered(app, 'bob');
    await bob.c.post(`/invites/${token}/join`);
    expect((await bob.c.post(`/trips/${trip.id}/invitations`, {})).status).toBe(403);
    expect((await bob.c.get(`/trips/${trip.id}/invitations`)).status).toBe(403);
    expect((await bob.c.del(`/invitations/${invitation.id}`)).status).toBe(403);
  });

  it('closed trips stop accepting members', async () => {
    const { app, db, owner, trip } = await tripWithOwner();
    const { token } = (await owner.c.post(`/trips/${trip.id}/invitations`, {})).body;
    await db.update(schema.trips).set({ status: 'completed' });
    const bob = await registered(app, 'bob');
    expect((await bob.c.get(`/invites/${token}`)).body.reason).toBe('trip_closed');
    expect((await bob.c.post(`/invites/${token}/join`)).status).toBe(410);
  });
});
