import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';

/** Waits until the service worker is active AND controlling this page. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
      );
    }
  });
}

function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test.describe('PWA manifest', () => {
  test('is valid and complete', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('application/manifest+json');
    const m = await res.json();
    expect(m).toMatchObject({
      id: '/',
      name: 'ChickAA (别鸡较)',
      short_name: 'ChickAA',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
    });
    expect(m.start_url).toMatch(/^\//);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);

    const purposes = new Set<string>();
    for (const icon of m.icons as { src: string; sizes: string; purpose?: string }[]) {
      const img = await request.get(icon.src);
      expect(img.ok(), icon.src).toBe(true);
      const { width, height } = pngSize(await img.body());
      expect(`${width}x${height}`).toBe(icon.sizes);
      purposes.add(icon.purpose ?? 'any');
    }
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  });

  test('iOS home-screen tags and launch screens are present', async ({ page, request }) => {
    await page.goto('/');
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(pngSize(await (await request.get(touchIcon!)).body())).toEqual({ width: 180, height: 180 });
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    const splashes = page.locator('link[rel="apple-touch-startup-image"]');
    expect(await splashes.count()).toBeGreaterThanOrEqual(10);
    const first = await splashes.first().getAttribute('href');
    expect((await request.get(first!)).ok()).toBe(true);
  });
});

test.describe('installability', () => {
  // Normal Playwright contexts are incognito, where Chrome never offers install.
  // Use a real (persistent) profile so Chrome runs its full installability checks.
  test('Chrome reports no installability errors', async ({ browserName, baseURL }, testInfo) => {
    test.skip(browserName !== 'chromium', 'CDP is Chromium-only');
    const dir = await mkdtemp(join(tmpdir(), 'chickaa-profile-'));
    const ctx = await chromium.launchPersistentContext(dir, {
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
      viewport: testInfo.project.use.viewport ?? null,
    });
    try {
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      await page.goto(baseURL!);
      await waitForServiceWorker(page);
      const cdp = await ctx.newCDPSession(page);
      const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
        installabilityErrors: { errorId: string }[];
      };
      expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
      const manifest = (await cdp.send('Page.getAppManifest')) as { errors: unknown[] };
      expect(manifest.errors).toEqual([]);
    } finally {
      await ctx.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

test.describe('service worker & offline', () => {
  test('registers and controls the page', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
  });

  test('app opens with no network, on any route', async ({ page, context }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    // The shell loads from the phone; signing in needs a connection.
    await expect(page.getByText('Offline · view only')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Can’t reach ChickAA' })).toBeVisible();
    await expect(page.getByText('You’re offline. Connect to the internet and try again.')).toBeVisible();

    // Deep link that was never visited: still served by the precached shell.
    await page.goto('/some/deep/link/never-visited');
    await expect(page.getByRole('heading', { name: 'Nothing to see here' })).toBeVisible();
    await expect(page.getByText('Offline · view only')).toBeVisible();

    await context.setOffline(false);
    await page.goto('/');
    await expect(page.getByText('Offline · view only')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Travel together/ })).toBeVisible();
  });

  test('API responses are never stored in Cache Storage', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    await page.evaluate(() => fetch('/api/v1/health'));
    const cachedApiUrls = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith('/api/')) out.push(req.url);
      }
      return out;
    });
    expect(cachedApiUrls).toEqual([]);
  });
});

test.describe('mobile layout & brand', () => {
  test('brand lockup: English name primary, 别鸡较 smaller underneath', async ({ page }) => {
    await page.goto('/');
    const en = page.getByText('ChickAA', { exact: false }).first();
    const zh = page.getByText('别鸡较').first();
    await expect(en).toBeVisible();
    await expect(zh).toBeVisible();
    const enSize = await en.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const zhSize = await zh.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(zhSize).toBeLessThan(enSize);
    const [enBox, zhBox] = [await en.boundingBox(), await zh.boundingBox()];
    expect(zhBox!.y).toBeGreaterThan(enBox!.y);
  });

  test('no horizontal scrolling and no CSP violations', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto('/');
    await waitForServiceWorker(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(problems.filter((p) => /Content Security Policy|Refused to/i.test(p))).toEqual([]);
    expect(problems).toEqual([]);
  });
});
