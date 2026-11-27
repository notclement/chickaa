import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { clientIp } from '../src/lib/http.ts';

const ipFor = async (headers: Record<string, string>, trustCloudflare = false) => {
  const app = new Hono<{ Variables: { config: { trustCloudflare: boolean } } }>();
  app.use('*', async (c, next) => {
    c.set('config', { trustCloudflare });
    await next();
  });
  app.get('/', (c) => c.text(clientIp(c)));
  return (await app.request('/', { headers })).text();
};

describe('clientIp (test report run 3, F1)', () => {
  it('never trusts client-sent true-client-ip; uses the last proxy hop', async () => {
    expect(await ipFor({ 'true-client-ip': '1.1.1.1', 'x-forwarded-for': '6.6.6.6, 2.2.2.2' })).toBe('2.2.2.2');
    expect(await ipFor({ 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' })).toBe('2.2.2.2'); // not behind Cloudflare
    expect(await ipFor({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' })).toBe('2.2.2.2');
    expect(await ipFor({})).toBe('unknown');
  });

  it('behind Cloudflare, uses cf-connecting-ip (Cloudflare sets it and refuses client copies)', async () => {
    expect(await ipFor({ 'cf-connecting-ip': '3.3.3.3', 'true-client-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9' }, true)).toBe('3.3.3.3');
    expect(await ipFor({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }, true)).toBe('2.2.2.2');
  });

  it('trusts Cloudflare automatically on Render, or when TRUST_CLOUDFLARE says so', () => {
    expect(loadConfig({ RENDER: 'true' }).trustCloudflare).toBe(true);
    expect(loadConfig({}).trustCloudflare).toBe(false);
    expect(loadConfig({ RENDER: 'true', TRUST_CLOUDFLARE: 'false' }).trustCloudflare).toBe(false);
    expect(loadConfig({ TRUST_CLOUDFLARE: 'true' }).trustCloudflare).toBe(true);
  });

  it('a spoofed true-client-ip no longer escapes the login limit', async () => {
    const { testApp, client, resetDb, TEST_DB_URL } = await import('./helpers.ts');
    if (!TEST_DB_URL) return;
    await resetDb();
    const { app } = await testApp();
    const c = client(app, '198.51.100.150');
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push((await c.call('POST', '/auth/login', { username: 'nobody', password: 'wrong-password' }, undefined, { 'true-client-ip': `203.0.113.${i}` })).status);
    }
    expect(codes.slice(0, 8).every((s) => s === 401)).toBe(true);
    expect(codes[8]).toBe(429);
  });
});
