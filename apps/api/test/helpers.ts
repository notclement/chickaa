import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '@chickaa/db';
import { runMigrations } from '@chickaa/db/migrate';
import { sql } from 'drizzle-orm';
import { createApp } from '../src/app.ts';
import { FxUnavailableError, type FxProvider } from '../src/fx/provider.ts';
import { loadConfig } from '../src/config.ts';

export const ORIGIN = 'https://chickaa.test';
export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

let shared: ReturnType<typeof createDb> | null = null;
let migrated = false;

/** Fake FX source with known rates (base→quote). Counts calls so tests can check caching. */
export const fakeFx = {
  calls: 0,
  rates: { 'THB>SGD': '0.0375', 'IDR>SGD': '8.45e-5', 'JPY>SGD': '0.0089', 'MYR>SGD': '0.29', 'SGD>IDR': '11834.32' } as Record<string, string>,
  down: false,
};
const fx: FxProvider = {
  name: 'FakeFX',
  async getRate(from, to, date) {
    fakeFx.calls++;
    const literal = fakeFx.rates[`${from}>${to}`];
    if (fakeFx.down || !literal) throw new FxUnavailableError('no rate');
    // Pretend weekends fall back to Friday.
    const d = new Date(`${date}T00:00:00Z`);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) d.setUTCDate(d.getUTCDate() - (dow === 0 ? 2 : 1));
    return { literal, date: d.toISOString().slice(0, 10) };
  },
};

/** App wired to the real test database. Tables are truncated before each test file's tests. */
export async function testApp() {
  if (!TEST_DB_URL) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to run integration tests');
  if (!migrated) {
    await runMigrations(TEST_DB_URL);
    migrated = true;
  }
  shared ??= createDb(TEST_DB_URL, { max: 5 });
  const dist = mkdtempSync(join(tmpdir(), 'chickaa-web-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  const config = { ...loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: ORIGIN, ADMIN_SETUP_CODE: 'correct-admin-code-123', PAYNOW_QR_PAYLOAD: '00020101021126380009SG.PAYNOW010100211+65900000000301152040000530370254045.005802SG5902NA6009SINGAPORE630404BE' }), webDist: dist };
  const app = createApp({ config, db: shared.db, pingDb: async () => true, fx });
  return { app, db: shared.db };
}

export async function resetDb() {
  const { db } = await testApp();
  await db.execute(sql`
    truncate table settlement_events, settlements, settlement_plans, expense_revisions, expense_splits,
      expense_payers, expenses, trip_fx_rates, fx_rate_cache, invitations, trip_members, trips,
      sessions, rate_limits, users restart identity cascade
  `);
}

type App = Awaited<ReturnType<typeof testApp>>['app'];

/** A browser-like client: keeps the session cookie and sends CSRF headers on writes. */
export function client(app: App, ip = '203.0.113.1') {
  let cookie = '';
  async function call(method: string, path: string, body?: unknown, raw?: { bytes: Uint8Array; type: string }) {
    const headers: Record<string, string> = { 'x-forwarded-for': ip };
    if (cookie) headers.cookie = cookie;
    if (method !== 'GET') {
      headers.origin = ORIGIN;
      headers['x-requested-with'] = 'chickaa';
    }
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (raw) headers['content-type'] = raw.type;
    const res = await app.request(`/api/v1${path}`, {
      method,
      headers,
      body: raw ? (raw.bytes as unknown as BodyInit) : body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const [pair] = set.split(';');
      cookie = /=$/.test(pair!) || /Max-Age=0/i.test(set) ? '' : pair!;
    }
    if (res.headers.get('content-type')?.startsWith('image/')) {
      return { status: res.status, body: new Uint8Array(await res.arrayBuffer()), setCookie: set, headers: res.headers };
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, setCookie: set, headers: res.headers };
  }
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown) => call('POST', p, b ?? {}),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b),
    del: (p: string) => call('DELETE', p),
    call,
    get cookie() {
      return cookie;
    },
    clearCookie() {
      cookie = '';
    },
  };
}

export async function registered(app: App, username: string, ip?: string) {
  const c = client(app, ip);
  const res = await c.post('/auth/register', { username, password: 'correct horse battery', displayName: username.toUpperCase() });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { c, user: res.body.user as { id: string }, recoveryCode: res.body.recoveryCode as string };
}
