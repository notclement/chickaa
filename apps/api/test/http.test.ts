import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/lib/http.ts';

const ipFor = async (headers: Record<string, string>) => {
  const app = new Hono();
  app.get('/', (c) => c.text(clientIp(c)));
  return (await app.request('/', { headers })).text();
};

describe('clientIp', () => {
  it('prefers edge headers, then the last proxy hop; never the client-claimed first hop', async () => {
    expect(await ipFor({ 'true-client-ip': '1.1.1.1', 'x-forwarded-for': '6.6.6.6, 2.2.2.2' })).toBe('1.1.1.1');
    expect(await ipFor({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' })).toBe('2.2.2.2');
    expect(await ipFor({})).toBe('unknown');
  });
});
