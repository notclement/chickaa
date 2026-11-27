import { beforeEach, describe, expect, it } from 'vitest';
import { registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

type Who = Awaited<ReturnType<typeof registered>>;

/** Spec §12 example: Alice +300, Bob +200, Charlie −250, David −150, Eve −100 (SGD). */
async function fiveFriends() {
  const { app, db } = await testApp();
  const alice = await registered(app, 'alice');
  const trip = (await alice.c.post('/trips', { name: 'Bali 2027', baseCurrency: 'SGD' })).body;
  const { token } = (await alice.c.post(`/trips/${trip.id}/invitations`, {})).body;
  const [bob, charlie, david, eve] = (await Promise.all(
    ['bob', 'charlie', 'david', 'eve'].map((n, i) => registered(app, n, `198.51.100.${70 + i}`)),
  )) as [Who, Who, Who, Who];
  for (const p of [bob, charlie, david, eve]) await p.c.post(`/invites/${token}/join`);
  const add = (who: Who, amount: string, shares: [Who, string][]) =>
    who.c.post(`/trips/${trip.id}/expenses`, {
      clientId: crypto.randomUUID(),
      description: 'Stuff',
      expenseDate: '2027-03-02',
      currency: 'SGD',
      amount,
      payers: [{ userId: who.user.id, amount }],
      split: { type: 'exact', amounts: shares.map(([p, a]) => ({ userId: p.user.id, amount: a })) },
    });
  // Alice pays 300 for C(150)+D(150); Bob pays 200 for C(100)+E(100). Then D's share is 150 but
  // the spec wants D −150, C −250, E −100: C=150+100, D=150, E=100 ✓.
  await add(alice, '300', [[charlie, '150'], [david, '150']]);
  await add(bob, '200', [[charlie, '100'], [eve, '100']]);
  return { app, db, trip, alice, bob, charlie, david, eve };
}

const nets = (b: { balances: { userId: string; net: string }[] }) => Object.fromEntries(b.balances.map((r) => [r.userId, r.net]));

describe.skipIf(!TEST_DB_URL)('settle up', () => {
  beforeEach(resetDb);

  it('preview while active: minimum transfers, proven optimal, nothing stored', async () => {
    const { trip, bob } = await fiveFriends();
    const s = (await bob.c.get(`/trips/${trip.id}/settlement`)).body;
    expect(s).toMatchObject({ state: 'preview', planVersion: null, algorithm: 'exact_dp', provenOptimal: true, nonZeroCount: 5 });
    expect(s.transfers).toHaveLength(4);
    expect(s.transfers.every((t: { id: string | null; status: string }) => t.id === null && t.status === 'pending')).toBe(true);
  });

  it('only the owner can finish; finishing locks expenses and stores the plan', async () => {
    const { trip, alice, bob } = await fiveFriends();
    expect((await bob.c.post(`/trips/${trip.id}/complete`)).status).toBe(403);
    const done = await alice.c.post(`/trips/${trip.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ state: 'plan', planVersion: 1, provenOptimal: true, progress: { confirmed: 0, total: 4, fullySettled: false } });
    expect(done.body.transfers.every((t: { id: string }) => t.id)).toBe(true);
    expect((await alice.c.get(`/trips/${trip.id}`)).body.status).toBe('completed');
    expect((await alice.c.post(`/trips/${trip.id}/complete`)).status).toBe(409);

    const late = await bob.c.post(`/trips/${trip.id}/expenses`, {
      clientId: crypto.randomUUID(),
      description: 'Late',
      expenseDate: '2027-03-09',
      currency: 'SGD',
      amount: '5',
      payers: [{ userId: bob.user.id, amount: '5' }],
      split: { type: 'equal', participants: [bob.user.id] },
    });
    expect(late.body.error.code).toBe('TRIP_LOCKED');
  });

  it('sent → confirmed by the recipient only; progress; fully settled; balances all zero', async () => {
    const { trip, alice, bob, charlie, david, eve } = await fiveFriends();
    const plan = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    const people = { [alice.user.id]: alice, [bob.user.id]: bob, [charlie.user.id]: charlie, [david.user.id]: david, [eve.user.id]: eve };

    const first = plan.transfers[0];
    const payer = people[first.fromUserId]!;
    const recipient = people[first.toUserId]!;
    const bystander = [alice, bob, charlie, david, eve].find((p) => p !== payer && p !== recipient)!;

    // Recipient can't mark "sent" for the payer; payer can't confirm their own payment.
    expect((await recipient.c.post(`/settlements/${first.id}/sent`)).status).toBe(403);
    expect((await payer.c.post(`/settlements/${first.id}/sent`)).body.transfers[0].status).toBe('sent');
    expect((await payer.c.post(`/settlements/${first.id}/sent`)).status).toBe(200); // retry is harmless
    expect((await payer.c.post(`/settlements/${first.id}/confirm`)).status).toBe(403);
    expect((await bystander.c.post(`/settlements/${first.id}/confirm`)).status).toBe(403);

    // A payment marked as sent does NOT count yet.
    let b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(nets(b)[first.fromUserId]).not.toBe('0');

    const afterConfirm = (await recipient.c.post(`/settlements/${first.id}/confirm`)).body;
    expect(afterConfirm.progress).toMatchObject({ confirmed: 1, total: 4, fullySettled: false });
    expect((await recipient.c.post(`/settlements/${first.id}/dispute`)).status).toBe(409); // confirmed is final

    for (const t of plan.transfers.slice(1)) {
      await people[t.fromUserId]!.c.post(`/settlements/${t.id}/sent`);
      await people[t.toUserId]!.c.post(`/settlements/${t.id}/confirm`);
    }
    const final = (await eve.c.get(`/trips/${trip.id}/settlement`)).body;
    expect(final.progress).toEqual({ confirmed: 4, total: 4, fullySettled: true });
    b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(Object.values(nets(b)).every((n) => n === '0')).toBe(true);

    const events = (await bob.c.get(`/settlements/${first.id}/events`)).body.events;
    expect(events.map((e: { toStatus: string }) => e.toStatus)).toEqual(['pending', 'sent', 'confirmed']);

    // Fully settled → the owner may now delete the trip.
    expect((await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' })).status).toBe(200);
  });

  it('owner can’t wipe a debt between two other people: the recipient can refuse (run 3, F4)', async () => {
    const { trip, alice, bob, charlie, david, eve } = await fiveFriends();
    const plan = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    const people = { [alice.user.id]: alice, [bob.user.id]: bob, [charlie.user.id]: charlie, [david.user.id]: david, [eve.user.id]: eve };
    const t = plan.transfers.find((x: { toUserId: string; fromUserId: string }) => x.toUserId !== alice.user.id && x.fromUserId !== alice.user.id)!;
    expect(t).toBeTruthy();
    await alice.c.call('POST', `/settlements/${t.id}/settle-outside`, { note: 'they sorted it' });
    const refused = await people[t.toUserId]!.c.call('POST', `/settlements/${t.id}/dispute`, { note: 'No, I was never paid' });
    expect(refused.status).toBe(200);
    expect(refused.body.transfers.find((x: { id: string }) => x.id === t.id)).toMatchObject({ status: 'disputed', settledOutside: false, settledOutsideBy: null });
    // Not settled, so the trip can't be deleted.
    expect((await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' })).status).toBe(409);
  });

  it('dispute → recipient can still confirm if the money turns up (U1); owner can mark "settled another way" (B1)', async () => {
    const { trip, alice, bob, charlie, david, eve } = await fiveFriends();
    const plan = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    const people = { [alice.user.id]: alice, [bob.user.id]: bob, [charlie.user.id]: charlie, [david.user.id]: david, [eve.user.id]: eve };
    const t = plan.transfers[0];
    const payer = people[t.fromUserId]!;
    const recipient = people[t.toUserId]!;

    await payer.c.post(`/settlements/${t.id}/sent`);
    const disputed = await recipient.c.call('POST', `/settlements/${t.id}/dispute`, { note: 'Nothing in my account yet' });
    expect(disputed.body.transfers[0].status).toBe('disputed');
    const ev = (await alice.c.get(`/settlements/${t.id}/events`)).body.events;
    expect(ev.at(-1)).toMatchObject({ toStatus: 'disputed', note: 'Nothing in my account yet' });
    // Money arrives after all: the recipient confirms straight from "disputed".
    expect((await recipient.c.post(`/settlements/${t.id}/confirm`)).body.transfers[0].status).toBe('confirmed');

    // The rest were settled in cash: the owner marks them, and the trip can finish settling.
    const others = plan.transfers.slice(1);
    const nonOwner = [bob, charlie, david, eve].find((p) => p.user.id !== others[0].toUserId && p.user.id !== others[0].fromUserId)!;
    expect((await nonOwner.c.post(`/settlements/${others[0].id}/settle-outside`)).status).toBe(403);
    for (const o of others) {
      const r = await alice.c.call('POST', `/settlements/${o.id}/settle-outside`, { note: 'paid in cash' });
      expect(r.status).toBe(200);
      const after = r.body.transfers.find((x: { id: string }) => x.id === o.id);
      // F4 (run 3): only the recipient's own debt is settled at once; others wait for the recipient.
      if (o.toUserId === alice.user.id) expect(after).toMatchObject({ status: 'confirmed', settledOutside: true, settledOutsideBy: alice.user.id });
      else {
        expect(after).toMatchObject({ status: 'sent', settledOutside: true, settledOutsideBy: alice.user.id });
        expect((await alice.c.get(`/trips/${trip.id}/settlement`)).body.progress.fullySettled).toBe(false);
        const confirmed = await people[o.toUserId]!.c.post(`/settlements/${o.id}/confirm`);
        expect(confirmed.body.transfers.find((x: { id: string }) => x.id === o.id)).toMatchObject({ status: 'confirmed', settledOutside: true });
      }
    }
    const final = (await alice.c.get(`/trips/${trip.id}/settlement`)).body;
    expect(final.progress).toEqual({ confirmed: 4, total: 4, fullySettled: true });
    expect(final.transfers.filter((x: { settledOutside: boolean }) => x.settledOutside)).toHaveLength(3);
    const b = (await alice.c.get(`/trips/${trip.id}/balances`)).body;
    expect(Object.values(nets(b)).every((n) => n === '0')).toBe(true);
    const ev2 = (await bob.c.get(`/settlements/${others[0].id}/events`)).body.events;
    expect(ev2.some((e: { note: string | null }) => e.note === 'Settled another way: paid in cash')).toBe(true);
    // And the trip can now be deleted.
    expect((await alice.c.call('DELETE', `/trips/${trip.id}`, { confirmName: 'Bali 2027' })).status).toBe(200);
  });

  it('reopen: blocked while a transfer is in flight; pending cancelled, confirmed kept, new plan covers the rest', async () => {
    const { trip, alice, bob, charlie, david, eve } = await fiveFriends();
    const plan = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    const people = { [alice.user.id]: alice, [bob.user.id]: bob, [charlie.user.id]: charlie, [david.user.id]: david, [eve.user.id]: eve };
    const [t0, t1] = plan.transfers;

    await people[t0.fromUserId]!.c.post(`/settlements/${t0.id}/sent`);
    await people[t0.toUserId]!.c.post(`/settlements/${t0.id}/confirm`);
    await people[t1.fromUserId]!.c.post(`/settlements/${t1.id}/sent`);
    expect((await bob.c.post(`/trips/${trip.id}/reopen`)).status).toBe(403);
    expect((await alice.c.post(`/trips/${trip.id}/reopen`)).body.error.code).toBe('TRANSFER_IN_FLIGHT');
    await people[t1.toUserId]!.c.post(`/settlements/${t1.id}/confirm`);

    const reopened = await alice.c.post(`/trips/${trip.id}/reopen`);
    expect(reopened.body.state).toBe('preview');
    expect(reopened.body.transfers).toHaveLength(2); // only what's left
    // Old plan's transfer actions are refused now.
    expect((await people[plan.transfers[2].fromUserId]!.c.post(`/settlements/${plan.transfers[2].id}/sent`)).status).toBe(409);

    const plan2 = (await alice.c.post(`/trips/${trip.id}/complete`)).body;
    expect(plan2.planVersion).toBe(2);
    expect(plan2.transfers).toHaveLength(2);
    // Payments made before the reopen stay visible (B3).
    expect(plan2.earlier.map((e: { id: string }) => e.id).sort()).toEqual([t0.id, t1.id].sort());
    expect(plan2.earlier.every((e: { status: string }) => e.status === 'confirmed')).toBe(true);
  });

  it('a trip where nobody owes anything is fully settled as soon as it is finished', async () => {
    const { app } = await testApp();
    const solo = await registered(app, 'solo');
    const trip = (await solo.c.post('/trips', { name: 'Solo', baseCurrency: 'SGD' })).body;
    const res = (await solo.c.post(`/trips/${trip.id}/complete`)).body;
    expect(res.transfers).toEqual([]);
    expect(res.progress).toEqual({ confirmed: 0, total: 0, fullySettled: true });
  });
});
