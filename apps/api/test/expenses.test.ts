import { schema } from '@ncc/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFx, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

const uuid = () => crypto.randomUUID();

/** Trip with Alice (owner), Bob, Charlie, David, base SGD. */
async function fourFriends(baseCurrency = 'SGD') {
  const { app, db } = await testApp();
  const alice = await registered(app, 'alice');
  const trip = (await alice.c.post('/trips', { name: 'Bali 2027', baseCurrency })).body;
  const { token } = (await alice.c.post(`/trips/${trip.id}/invitations`, {})).body;
  const others = await Promise.all(['bob', 'charlie', 'david'].map((n, i) => registered(app, n, `198.51.100.${40 + i}`)));
  for (const o of others) await o.c.post(`/invites/${token}/join`);
  const [bob, charlie, david] = others as [typeof alice, typeof alice, typeof alice];
  const ids = { alice: alice.user.id, bob: bob.user.id, charlie: charlie.user.id, david: david.user.id };
  return { app, db, trip, alice, bob, charlie, david, ids };
}

const net = (balances: { userId: string; net: string }[], id: string) => balances.find((b) => b.userId === id)!.net;

describe.skipIf(!TEST_DB_URL)('expenses', () => {
  beforeEach(async () => {
    await resetDb();
    fakeFx.calls = 0;
    fakeFx.down = false;
  });

  it('spec example: SGD 300, Alice paid 200 + Bob 100, four share equally', async () => {
    const { trip, alice, ids } = await fourFriends();
    const res = await alice.c.post(`/trips/${trip.id}/expenses`, {
      clientId: uuid(),
      description: 'Dinner',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '300',
      payers: [
        { userId: ids.alice, amount: '200' },
        { userId: ids.bob, amount: '100.00' },
      ],
      split: { type: 'equal', participants: [ids.alice, ids.bob, ids.charlie, ids.david] },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: '30000', baseAmount: '30000', rate: '1', rateSource: 'same_currency', splitType: 'equal', version: 1 });

    const b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(b.totalSpent).toBe('30000');
    expect(net(b.balances, ids.alice)).toBe('12500');
    expect(net(b.balances, ids.bob)).toBe('2500');
    expect(net(b.balances, ids.charlie)).toBe('-7500');
    expect(net(b.balances, ids.david)).toBe('-7500');
  });

  it('multi-currency: THB hotel with the daily API rate, rate is kept on the expense', async () => {
    const { trip, alice, ids } = await fourFriends();
    const res = await alice.c.post(`/trips/${trip.id}/expenses`, {
      clientId: uuid(),
      description: 'Hotel',
      expenseDate: '2027-03-01',
      currency: 'THB',
      amount: '12,000',
      rate: { source: 'api' },
      payers: [{ userId: ids.alice, amount: '12000' }],
      split: { type: 'shares', shares: [{ userId: ids.alice, shares: 2 }, { userId: ids.bob, shares: 1 }, { userId: ids.charlie, shares: 1 }] },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ currency: 'THB', amount: '1200000', baseAmount: '45000', rate: '0.0375', rateSource: 'api', rateDate: '2027-03-01' });
    expect(res.body.splits.map((s: { baseAmount: string }) => s.baseAmount)).toEqual(['22500', '11250', '11250']);
    expect(res.body.splits[0].shares).toBe(2);
  });

  it('IDR with an exponent-format API rate, weekend date → provider date; rate cached once', async () => {
    const { trip, alice, ids } = await fourFriends();
    const mk = () =>
      alice.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Ubud tour',
        expenseDate: '2027-03-06', // Saturday
        currency: 'IDR',
        amount: '1500000',
        rate: { source: 'api' },
        payers: [{ userId: ids.bob, amount: '1500000' }],
        split: { type: 'equal', participants: [ids.alice, ids.bob, ids.charlie] },
      });
    const first = await mk();
    expect(first.body).toMatchObject({ rate: '0.0000845', baseAmount: '12675', rateDate: '2027-03-05' });
    await mk();
    expect(fakeFx.calls).toBe(1); // second expense used the cache
  });

  it('historical rates never change automatically, even if the provider changes later', async () => {
    const { trip, alice, ids, db } = await fourFriends();
    const e = (
      await alice.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Massage',
        expenseDate: '2027-03-03',
        currency: 'THB',
        amount: '800',
        rate: { source: 'api' },
        payers: [{ userId: ids.alice, amount: '800' }],
        split: { type: 'equal', participants: [ids.alice, ids.bob] },
      })
    ).body;
    // Provider "revises" the rate and the cache is wiped: the stored expense must not move.
    fakeFx.rates['THB>SGD'] = '0.05';
    await db.delete(schema.fxRateCache);
    const again = (await alice.c.get(`/expenses/${e.id}`)).body;
    expect(again.rate).toBe('0.0375');
    expect(again.baseAmount).toBe('3000');
    // Editing only the description keeps the original rate too.
    const edited = await alice.c.put(`/expenses/${e.id}`, {
      version: 1,
      description: 'Thai massage',
      expenseDate: '2027-03-03',
      currency: 'THB',
      amount: '800',
      rate: { source: 'api' },
      payers: [{ userId: ids.alice, amount: '800' }],
      split: { type: 'equal', participants: [ids.alice, ids.bob] },
    });
    expect(edited.body).toMatchObject({ rate: '0.0375', baseAmount: '3000', version: 2, description: 'Thai massage' });
    fakeFx.rates['THB>SGD'] = '0.0375';
  });

  it('manual and trip-fixed rates', async () => {
    const { trip, alice, bob, ids } = await fourFriends();
    const base = {
      description: 'Satay',
      expenseDate: '2027-03-02',
      currency: 'MYR',
      amount: '150',
      payers: [{ userId: ids.alice, amount: '150' }],
      split: { type: 'equal', participants: [ids.alice, ids.bob, ids.charlie] },
    };
    const manual = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, clientId: uuid(), rate: { source: 'manual', value: '0.30' } });
    expect(manual.body).toMatchObject({ rate: '0.3', rateSource: 'manual', baseAmount: '4500' });

    expect((await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, clientId: uuid(), rate: { source: 'trip_fixed' } })).status).toBe(400);
    expect((await bob.c.put(`/trips/${trip.id}/fx-rates/MYR`, { rate: '0.31' })).status).toBe(403);
    expect((await alice.c.put(`/trips/${trip.id}/fx-rates/MYR`, { rate: '0.31' })).status).toBe(200);
    const fixed = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, clientId: uuid(), rate: { source: 'trip_fixed' } });
    expect(fixed.body).toMatchObject({ rate: '0.31', rateSource: 'trip_fixed', baseAmount: '4650' });

    const suggest = (await bob.c.get(`/trips/${trip.id}/fx-rate?currency=MYR&date=2027-03-02`)).body;
    expect(suggest).toMatchObject({ rate: '0.31', source: 'trip_fixed' });
    const thb = (await bob.c.get(`/trips/${trip.id}/fx-rate?currency=THB&date=2027-03-02`)).body;
    expect(thb).toMatchObject({ rate: '0.0375', source: 'api', provider: 'FakeFX' });
  });

  it('a foreign-currency expense needs a rate; provider outage gives a clear message', async () => {
    const { trip, alice, ids } = await fourFriends();
    const base = {
      clientId: uuid(),
      description: 'Ramen',
      expenseDate: '2027-03-02',
      currency: 'JPY',
      amount: '8000',
      payers: [{ userId: ids.alice, amount: '8000' }],
      split: { type: 'equal', participants: [ids.alice] },
    };
    expect((await alice.c.post(`/trips/${trip.id}/expenses`, base)).body.error.details.fields.rate).toBeTruthy();
    fakeFx.down = true;
    const down = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, rate: { source: 'api' } });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('FX_UNAVAILABLE');
    expect(down.body.error.message).toMatch(/Enter the rate yourself/);
  });

  it('all split methods validate and reconcile', async () => {
    const { trip, alice, ids } = await fourFriends();
    const post = (split: unknown, amount = '100') =>
      alice.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Thing',
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount,
        payers: [{ userId: ids.alice, amount }],
        split,
      });
    const exact = await post({ type: 'exact', amounts: [{ userId: ids.alice, amount: '60' }, { userId: ids.bob, amount: '40' }] });
    expect(exact.body.splits.map((s: { amount: string }) => s.amount)).toEqual(['6000', '4000']);
    const badExact = await post({ type: 'exact', amounts: [{ userId: ids.alice, amount: '60' }, { userId: ids.bob, amount: '30' }] });
    expect(badExact.status).toBe(400);
    expect(badExact.body.error.message).toMatch(/add up to less/);

    const pct = await post({ type: 'percentage', percents: [{ userId: ids.alice, percent: '33.33' }, { userId: ids.bob, percent: '33.33' }, { userId: ids.charlie, percent: '33.34' }] }, '10');
    expect(pct.body.splits.map((s: { amount: string }) => s.amount)).toEqual(['333', '333', '334']);
    expect(pct.body.splits[0].percentBp).toBe(3333);
    expect((await post({ type: 'percentage', percents: [{ userId: ids.alice, percent: '50' }] })).status).toBe(400);

    const eq3 = await post({ type: 'equal', participants: [ids.alice, ids.bob, ids.charlie] });
    expect(eq3.body.splits.map((s: { amount: string }) => s.amount)).toEqual(['3334', '3333', '3333']);
  });

  it('rejects non-members, bad amounts and wrong payer totals', async () => {
    const { trip, alice, ids } = await fourFriends();
    const { user: stranger } = await registered((await testApp()).app, 'stranger', '198.51.100.99');
    const base = { clientId: uuid(), description: 'X', expenseDate: '2027-03-02', currency: 'SGD', amount: '10' };
    const r1 = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, payers: [{ userId: stranger.id, amount: '10' }], split: { type: 'equal', participants: [ids.alice] } });
    expect(r1.status).toBe(400);
    expect(r1.body.error.message).toMatch(/member/);
    const r2 = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, amount: '10.001', payers: [{ userId: ids.alice, amount: '10' }], split: { type: 'equal', participants: [ids.alice] } });
    expect(r2.status).toBe(400);
    const r3 = await alice.c.post(`/trips/${trip.id}/expenses`, { ...base, payers: [{ userId: ids.alice, amount: '9' }], split: { type: 'equal', participants: [ids.alice] } });
    expect(r3.body.error.message).toMatch(/paid adds up to less/);
  });

  it('duplicate submissions (same clientId) never create two expenses', async () => {
    const { trip, alice, ids } = await fourFriends();
    const payload = {
      clientId: uuid(),
      description: 'Taxi',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '30',
      payers: [{ userId: ids.alice, amount: '30' }],
      split: { type: 'equal', participants: [ids.alice, ids.bob] },
    };
    // Five taps at once on a flaky connection.
    const results = await Promise.all(Array.from({ length: 5 }, () => alice.c.post(`/trips/${trip.id}/expenses`, payload)));
    const ids5 = new Set(results.map((r) => r.body.id));
    expect(ids5.size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await alice.c.get(`/trips/${trip.id}/expenses`)).body.expenses).toHaveLength(1);

    const different = await alice.c.post(`/trips/${trip.id}/expenses`, { ...payload, amount: '31', payers: [{ userId: ids.alice, amount: '31' }] });
    expect(different.status).toBe(409);
  });

  it('editing uses optimistic versions; conflicts never overwrite silently', async () => {
    const { trip, alice, bob, ids } = await fourFriends();
    const e = (
      await bob.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Lunch',
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount: '40',
        payers: [{ userId: ids.bob, amount: '40' }],
        split: { type: 'equal', participants: [ids.alice, ids.bob] },
      })
    ).body;
    const edit = (who: typeof alice, version: number, amount: string) =>
      who.c.put(`/expenses/${e.id}`, {
        version,
        description: 'Lunch',
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount,
        payers: [{ userId: ids.bob, amount }],
        split: { type: 'equal', participants: [ids.alice, ids.bob] },
      });

    expect((await edit(bob, 1, '50')).body).toMatchObject({ version: 2, amount: '5000' });
    const stale = await edit(alice, 1, '60'); // owner, but editing an old copy
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.current.amount).toBe('5000');
    expect((await edit(alice, 2, '60')).body.version).toBe(3);

    const b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(net(b.balances, ids.bob)).toBe('3000');
  });

  it('only the creator or the trip owner can edit/delete', async () => {
    const { trip, bob, charlie, ids } = await fourFriends();
    const e = (
      await bob.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Snacks',
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount: '12',
        payers: [{ userId: ids.bob, amount: '12' }],
        split: { type: 'equal', participants: [ids.bob, ids.charlie] },
      })
    ).body;
    expect((await charlie.c.del(`/expenses/${e.id}?version=1`)).status).toBe(403);
    expect((await charlie.c.get(`/expenses/${e.id}`)).status).toBe(200); // but can view
  });

  it('soft delete: removed from balances, kept in history with a revision trail', async () => {
    const { trip, alice, bob, ids, db } = await fourFriends();
    const e = (
      await alice.c.post(`/trips/${trip.id}/expenses`, {
        clientId: uuid(),
        description: 'Boat',
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount: '90',
        payers: [{ userId: ids.alice, amount: '90' }],
        split: { type: 'equal', participants: [ids.alice, ids.bob, ids.charlie] },
      })
    ).body;
    expect((await alice.c.del(`/expenses/${e.id}?version=7`)).status).toBe(409);
    expect((await alice.c.del(`/expenses/${e.id}?version=1`)).status).toBe(200);

    expect((await bob.c.get(`/trips/${trip.id}/expenses`)).body.expenses).toEqual([]);
    const b = (await bob.c.get(`/trips/${trip.id}/balances`)).body;
    expect(b.balances.every((r: { net: string }) => r.net === '0')).toBe(true);

    const viewed = (await bob.c.get(`/expenses/${e.id}`)).body;
    expect(viewed.deleted).toBe(true);
    const revs = (await bob.c.get(`/expenses/${e.id}/revisions`)).body.revisions;
    expect(revs.map((r: { action: string }) => r.action)).toEqual(['create', 'delete']);
    expect(revs[1].actor.displayName).toBe('ALICE');
    const rows = await db.select().from(schema.expenses);
    expect(rows).toHaveLength(1); // nothing hard-deleted
  });

  it('completed trips reject new expenses; non-members see nothing', async () => {
    const { trip, alice, db, ids, app } = await fourFriends();
    const mallory = await registered(app, 'mallory', '198.51.100.98');
    expect((await mallory.c.get(`/trips/${trip.id}/expenses`)).status).toBe(404);
    expect((await mallory.c.get(`/trips/${trip.id}/balances`)).status).toBe(404);
    await db.update(schema.trips).set({ status: 'completed' });
    const res = await alice.c.post(`/trips/${trip.id}/expenses`, {
      clientId: uuid(),
      description: 'Late',
      expenseDate: '2027-03-09',
      currency: 'SGD',
      amount: '5',
      payers: [{ userId: ids.alice, amount: '5' }],
      split: { type: 'equal', participants: [ids.alice] },
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRIP_LOCKED');
  });

  it('acceptance: a mixed-currency trip with multiple payers and split methods balances to exactly zero', async () => {
    const { trip, alice, bob, charlie, david, ids } = await fourFriends();
    const all = [ids.alice, ids.bob, ids.charlie, ids.david];
    const add = (who: typeof alice, body: object) => who.c.post(`/trips/${trip.id}/expenses`, { clientId: uuid(), expenseDate: '2027-03-02', ...body });
    await add(alice, { description: 'Villa', currency: 'IDR', amount: '9,875,000', rate: { source: 'api' }, payers: [{ userId: ids.alice, amount: '5000000' }, { userId: ids.bob, amount: '4875000' }], split: { type: 'equal', participants: all } });
    await add(bob, { description: 'Scooters', currency: 'IDR', amount: '600000', rate: { source: 'manual', value: '0.0000851' }, payers: [{ userId: ids.bob, amount: '600000' }], split: { type: 'shares', shares: [{ userId: ids.bob, shares: 2 }, { userId: ids.charlie, shares: 1 }] } });
    await add(charlie, { description: 'Airport taxi', currency: 'SGD', amount: '33.33', payers: [{ userId: ids.charlie, amount: '33.33' }], split: { type: 'percentage', percents: [{ userId: ids.alice, percent: '25' }, { userId: ids.bob, percent: '25' }, { userId: ids.charlie, percent: '25' }, { userId: ids.david, percent: '25' }] } });
    await add(david, { description: 'Dinner', currency: 'SGD', amount: '187.65', payers: [{ userId: ids.david, amount: '187.65' }], split: { type: 'exact', amounts: [{ userId: ids.alice, amount: '50' }, { userId: ids.bob, amount: '45.65' }, { userId: ids.charlie, amount: '42' }, { userId: ids.david, amount: '50' }] } });

    const b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(b.expenseCount).toBe(4);
    const sum = b.balances.reduce((s: bigint, r: { net: string }) => s + BigInt(r.net), 0n);
    expect(sum).toBe(0n);
    const paid = b.balances.reduce((s: bigint, r: { paid: string }) => s + BigInt(r.paid), 0n);
    expect(paid.toString()).toBe(b.totalSpent);
  });
});
