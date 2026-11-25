import { beforeEach, describe, expect, it } from 'vitest';
import { sniffImage } from '../src/routes/avatars.ts';
import { registered, resetDb, TEST_DB_URL, testApp } from './helpers.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]);
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8 '].map((c) => c.charCodeAt(0)), new Array(100).fill(1)));

describe('sniffImage', () => {
  it('recognises JPEG and WebP by their bytes, rejects others', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(WEBP)).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG not accepted
  });
});

describe.skipIf(!TEST_DB_URL)('profile photos', () => {
  beforeEach(resetDb);

  it('upload → visible to trip-mates (cacheable), hidden from strangers, removable', async () => {
    const { app } = await testApp();
    const alice = await registered(app, 'alice');
    const bob = await registered(app, 'bob', '198.51.100.60');
    const eve = await registered(app, 'eve', '198.51.100.61');
    const trip = (await alice.c.post('/trips', { name: 'Trip', baseCurrency: 'SGD' })).body;
    const { token } = (await alice.c.post(`/trips/${trip.id}/invitations`, {})).body;
    await bob.c.post(`/invites/${token}/join`);

    const up = await alice.c.call('PUT', '/auth/me/avatar', undefined, { bytes: WEBP, type: 'image/webp' });
    expect(up.status).toBe(200);
    expect(up.body.user.avatarVersion).toBe(1);
    expect((await alice.c.get('/auth/session')).body.user.avatarVersion).toBe(1);
    expect((await bob.c.get(`/trips/${trip.id}`)).body.members[0].avatarVersion).toBe(1);

    const seen = await bob.c.get(`/users/${alice.user.id}/avatar?v=1`);
    expect(seen.status).toBe(200);
    expect(seen.headers.get('content-type')).toBe('image/webp');
    expect(seen.headers.get('cache-control')).toContain('immutable');
    expect([...(seen.body as Uint8Array)]).toEqual([...WEBP]);
    expect((await alice.c.get(`/users/${alice.user.id}/avatar?v=1`)).status).toBe(200);
    expect((await eve.c.get(`/users/${alice.user.id}/avatar?v=1`)).status).toBe(404);

    const again = await alice.c.call('PUT', '/auth/me/avatar', undefined, { bytes: JPEG, type: 'image/jpeg' });
    expect(again.body.user.avatarVersion).toBe(2);

    expect((await alice.c.del('/auth/me/avatar')).body.user.avatarVersion).toBeNull();
    expect((await bob.c.get(`/users/${alice.user.id}/avatar?v=2`)).status).toBe(404);
  });

  it('rejects big files and non-images', async () => {
    const { app } = await testApp();
    const alice = await registered(app, 'alice');
    const big = new Uint8Array(25 * 1024);
    big.set([0xff, 0xd8, 0xff]);
    expect((await alice.c.call('PUT', '/auth/me/avatar', undefined, { bytes: big, type: 'image/jpeg' })).status).toBe(413);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect((await alice.c.call('PUT', '/auth/me/avatar', undefined, { bytes: svg, type: 'image/webp' })).status).toBe(415);
  });
});
