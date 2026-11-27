import { beforeEach, describe, expect, it } from 'vitest';
import { client, fakeFx, ORIGIN, registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

/** Regression tests for test report run 2 (26 Nov 2026). */
describe.skipIf(!TEST_DB_URL)('test report run 2 fixes', () => {
  beforeEach(async () => {
    await resetDb();
    fakeFx.down = false;
  });

  async function trip() {
    const { app } = await testApp();
    const alice = await registered(app, 'alice');
    const t = (await alice.c.post('/trips', { name: 'T', baseCurrency: 'SGD' })).body;
    return { app, alice, t };
  }

  it('B2: impossible calendar dates are a 400, never a 500', async () => {
    const { alice, t } = await trip();
    for (const d of ['2026-02-30', '2026-13-45']) {
      expect((await alice.c.post('/trips', { name: 'X', baseCurrency: 'SGD', startDate: d })).status).toBe(400);
      const e = await alice.c.post(`/trips/${t.id}/expenses`, {
        clientId: crypto.randomUUID(),
        description: 'x',
        expenseDate: d,
        currency: 'SGD',
        amount: '1',
        payers: [{ userId: alice.user.id, amount: '1' }],
        split: { type: 'equal', participants: [alice.user.id] },
      });
      expect(e.status).toBe(400);
    }
    expect((await alice.c.get(`/trips/${t.id}/fx-rate?currency=THB&date=2026-02-30`)).status).toBe(400);
    expect((await alice.c.post('/trips', { name: 'Leap', baseCurrency: 'SGD', startDate: '2028-02-29' })).status).toBe(201);
  });

  it('U2: a manual or fixed rate wildly off the official rate is refused', async () => {
    const { alice, t } = await trip();
    const base = {
      description: 'Satay',
      expenseDate: '2027-03-02',
      currency: 'MYR',
      amount: '10',
      payers: [{ userId: alice.user.id, amount: '10' }],
      split: { type: 'equal', participants: [alice.user.id] },
    };
    const crazy = await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '1000000' } });
    expect(crazy.status).toBe(400);
    expect(crazy.body.error.message).toMatch(/looks wrong/);
    expect((await alice.c.put(`/trips/${t.id}/fx-rates/MYR`, { rate: '1000' })).status).toBe(400);
    // Near the official rate (0.29) is fine, and so is any rate when the official one is unavailable.
    expect((await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '0.31' } })).status).toBe(201);
    // Run 3, F7: more than 10× off (3.0 vs 0.29) needs the person's confirmation; 100× off never passes.
    const tenX = await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '3.0' } });
    expect(tenX.status).toBe(400);
    expect(tenX.body.error.message).toMatch(/the rate for 2027-03-02 is about 1 MYR = /);
    expect((await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '3.0', confirmed: true } })).status).toBe(201);
    expect((await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '0.9' } })).status).toBe(201); // ~3× off: allowed
    expect((await alice.c.post(`/trips/${t.id}/expenses`, { ...base, clientId: crypto.randomUUID(), rate: { source: 'manual', value: '40', confirmed: true } })).status).toBe(400);
    fakeFx.down = true;
    expect((await alice.c.post(`/trips/${t.id}/expenses`, { ...base, expenseDate: '2027-04-01', clientId: crypto.randomUUID(), rate: { source: 'manual', value: '5' } })).status).toBe(201);
  });

  it('U4: dead invite links reveal nothing about the trip', async () => {
    const { app, alice, t } = await trip();
    const inv = (await alice.c.post(`/trips/${t.id}/invitations`, {})).body;
    await alice.c.del(`/invitations/${inv.invitation.id}`);
    const p = (await client(app, '198.51.100.90').get(`/invites/${inv.token}`)).body;
    expect(p).toMatchObject({ valid: false, reason: 'revoked', trip: null });
    // A member opening an old link still sees their trip.
    expect((await alice.c.get(`/invites/${inv.token}`)).body.trip.name).toBe('T');
  });

  it('U7: zero rows in an exact split are dropped', async () => {
    const { app, alice, t } = await trip();
    const bob = await registered(app, 'bob', '198.51.100.91');
    const { token } = (await alice.c.post(`/trips/${t.id}/invitations`, {})).body;
    await bob.c.post(`/invites/${token}/join`);
    const e = await alice.c.post(`/trips/${t.id}/expenses`, {
      clientId: crypto.randomUUID(),
      description: 'x',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount: '10',
      payers: [{ userId: alice.user.id, amount: '10' }],
      split: { type: 'exact', amounts: [{ userId: alice.user.id, amount: '10' }, { userId: bob.user.id, amount: '0' }] },
    });
    expect(e.body.splits).toHaveLength(1);
  });

  it('U8: failed sign-ups do not count towards the per-network limit', async () => {
    const { app } = await testApp();
    for (let i = 0; i < 30; i++) {
      const r = await client(app, '198.51.100.92').post('/auth/register', { username: 'x!', password: 'short', displayName: '' });
      expect(r.status).toBe(400);
    }
    expect((await client(app, '198.51.100.92').post('/auth/register', { username: 'realuser', password: 'correct horse battery', displayName: 'R' })).status).toBe(201);
  });

  it('B6: an oversized upload closes the connection instead of leaving it half-read', async () => {
    const { app, alice } = await trip();
    const big = new Uint8Array(70 * 1024);
    const res = await app.request('/api/v1/auth/me/avatar', {
      method: 'PUT',
      headers: { origin: ORIGIN, 'x-requested-with': 'chickaa', 'content-type': 'image/webp', 'content-length': String(big.length), cookie: alice.c.cookie },
      body: big as unknown as BodyInit,
    });
    expect(res.status).toBe(413);
    expect(res.headers.get('connection')).toBe('close');
  });

  it('O6: large JSON responses are compressed', async () => {
    const { app, alice, t } = await trip();
    for (let i = 0; i < 15; i++) {
      await alice.c.post(`/trips/${t.id}/expenses`, {
        clientId: crypto.randomUUID(),
        description: `Expense number ${i} with a reasonably long description`,
        expenseDate: '2027-03-02',
        currency: 'SGD',
        amount: '10',
        payers: [{ userId: alice.user.id, amount: '10' }],
        split: { type: 'equal', participants: [alice.user.id] },
      });
    }
    const res = await app.request(`/api/v1/trips/${t.id}/expenses`, { headers: { cookie: alice.c.cookie, 'accept-encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
  });

  it('F8 (run 3): invisible and right-to-left characters are stripped from names and text', async () => {
    const { app } = await testApp();
    const res = await client(app, '198.51.100.160').post('/auth/register', { username: 'zw_user', password: 'correct horse battery', displayName: 'Zero\u200bWidth\u202eName\ufeff' });
    expect(res.status).toBe(201);
    expect(res.body.user.displayName).toBe('ZeroWidthName');
    const onlyInvisible = await client(app, '198.51.100.161').post('/auth/register', { username: 'zw_user2', password: 'correct horse battery', displayName: '\u200b\u202e' });
    expect(onlyInvisible.status).toBe(400);
    // Emoji joiners survive.
    const fam = await client(app, '198.51.100.162').post('/auth/register', { username: 'zw_user3', password: 'correct horse battery', displayName: 'Fam 👨\u200d👩\u200d👧' });
    expect(fam.body.user.displayName).toBe('Fam 👨\u200d👩\u200d👧');
    const owner = { c: client(app, '198.51.100.160') };
    await owner.c.post('/auth/login', { username: 'zw_user', password: 'correct horse battery' });
    const t = (await owner.c.post('/trips', { name: 'Bali\u2066\u202e', baseCurrency: 'SGD' })).body;
    expect(t.name).toBe('Bali');
  });
});
