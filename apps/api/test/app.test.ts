import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

function setup(pingDb = async () => true) {
  const dist = mkdtempSync(join(tmpdir(), 'chickaa-web-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>ChickAA</title>');
  writeFileSync(join(dist, 'sw.js'), 'self.x=1');
  writeFileSync(join(dist, 'manifest.webmanifest'), '{}');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
  const config = { ...loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://chickaa.test' }), webDist: dist };
  return createApp({ config, db: null, pingDb });
}

describe('api', () => {
  it('reports health and db status', async () => {
    const res = await setup().request('/api/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('reports db unavailable without failing', async () => {
    const res = await setup(async () => {
      throw new Error('down');
    }).request('/api/v1/health');
    expect((await res.json()).db).toBe('unavailable');
  });

  it('returns JSON 404 for unknown API routes (never the SPA)', async () => {
    const res = await setup().request('/api/v2/nope');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('blocks cross-site state-changing requests', async () => {
    const app = setup();
    const evil = await app.request('/api/v1/health', { method: 'POST', headers: { origin: 'https://evil.test' } });
    expect(evil.status).toBe(403);
    const ok = await app.request('/api/v1/health', {
      method: 'POST',
      headers: { origin: 'https://chickaa.test', 'x-requested-with': 'chickaa' },
    });
    expect(ok.status).not.toBe(403); // passes CSRF
  });
});

describe('static PWA serving', () => {
  it('falls back to index.html for app routes so deep links work', async () => {
    const res = await setup().request('/trips/123');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ChickAA');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('never lets HTTP caches hold the service worker or manifest', async () => {
    const app = setup();
    expect((await app.request('/sw.js')).headers.get('cache-control')).toBe('no-cache');
    const m = await app.request('/manifest.webmanifest');
    expect(m.headers.get('content-type')).toBe('application/manifest+json');
    expect(m.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed assets immutably', async () => {
    const res = await setup().request('/assets/app-abc123.js');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('404s missing files instead of serving HTML', async () => {
    expect((await setup().request('/assets/missing.js')).status).toBe(404);
  });

  it('blocks path traversal', async () => {
    for (const p of ['/..%2f..%2f..%2fetc%2fpasswd', '/assets/..%2f..%2f..%2fetc%2fhosts.txt']) {
      const res = await setup().request(p);
      expect(await res.text()).not.toMatch(/root:|localhost/);
    }
  });

  it('sends strict security headers', async () => {
    const res = await setup().request('/');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});

describe('config', () => {
  it('uses Render\'s external URL when PUBLIC_ORIGIN is not set', () => {
    expect(loadConfig({ RENDER_EXTERNAL_URL: 'https://chickaa.onrender.com/' }).publicOrigin).toBe('https://chickaa.onrender.com');
    expect(
      loadConfig({ RENDER_EXTERNAL_URL: 'https://chickaa.onrender.com', PUBLIC_ORIGIN: 'https://split.example.com' }).publicOrigin,
    ).toBe('https://split.example.com');
  });
});

describe('keep-alive', () => {
  it('answers /ping without touching the database', async () => {
    let pinged = false;
    const res = await setup(async () => {
      pinged = true;
      return true;
    }).request('/api/v1/ping');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('pong');
    expect(pinged).toBe(false);
  });
});

describe('hardening', () => {
  it('rejects oversized request bodies', async () => {
    const res = await setup().request('/api/v1/health', {
      method: 'POST',
      headers: { origin: 'https://chickaa.test', 'x-requested-with': 'chickaa', 'content-type': 'application/json' },
      body: JSON.stringify({ x: 'a'.repeat(70 * 1024) }),
    });
    expect(res.status).toBe(413);
  });
});
