import { schema } from '@ncc/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { client, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

describe.skipIf(!TEST_DB_URL)('deleting a trip', () => {
  beforeEach(resetDb);

  async function setup() {
    const { app, db } = await testApp();
    const alice = await registered(app, 'alice');
    const trip = (await alice.c.post('/trips', { name: 'Bali 2027', baseCurrency: 'SGD' })).body;
    const { token } = (await alice.c.post(`/trips/${trip.id}/invitations`, {})).body;
    const bob = await registered(app, 'bob', '198.51.100.50');
    await bob.c.post(`/invites/${token}/join`);
    return { app, db, alice, bob, trip, token };
  }

  const expense = (tripId: string, payer: string, people: string[], amount = '20') => ({
    clientId: crypto.randomUUID(),
    description: 'Taxi',
    expenseDate: '2027-03-02',
    currency: 'SGD',
    amount,
    payers: [{ userId: payer, amount }],
    split: { type: 'equal', participants: people },
  });

  it('only the creator can delete, and must type the trip name', async () => {
    const { alice, bob, trip } = await setup();
    expect((await bob.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' })).status).toBe(403);
    const wrong = await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'bali' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fields.confirmName).toBeTruthy();
  });

  it('is blocked while anyone owes money, allowed once balances are all zero', async () => {
    const { alice, bob, trip } = await setup();
    const e = (await alice.c.post(`/trips/${trip.id}/expenses`, expense(trip.id, alice.user.id, [alice.user.id, bob.user.id]))).body;
    const blocked = await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('TRIP_NOT_SETTLED');
    expect(blocked.body.error.details.balances.map((b: { net: string }) => b.net).sort()).toEqual(['-1000', '1000']);

    // Bob pays Alice back with an expense that zeroes it out (settlement flow arrives in Phase 6).
    await bob.c.post(`/trips/${trip.id}/expenses`, expense(trip.id, bob.user.id, [alice.user.id], '10'));
    const ok = await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: '  Bali 2027 ' });
    expect(ok.status).toBe(200);
    expect(e.id).toBeTruthy();
  });

  it('a deleted trip disappears for everyone, its links stop working, records are kept', async () => {
    const { app, db, alice, bob, trip, token } = await setup();
    expect((await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' })).status).toBe(200);
    expect((await alice.c.get('/trips')).body.trips).toEqual([]);
    expect((await bob.c.get('/trips')).body.trips).toEqual([]);
    expect((await bob.c.get(`/trips/${trip.id}`)).status).toBe(404);
    expect((await bob.c.get(`/trips/${trip.id}/expenses`)).status).toBe(404);
    expect((await client(app).get(`/invites/${token}`)).body.reason).toBe('not_found');
    const carol = await registered(app, 'carol', '198.51.100.51');
    expect((await carol.c.post(`/invites/${token}/join`)).status).toBe(404);
    const rows = await db.select().from(schema.trips);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).toBeTruthy();
  });
});
