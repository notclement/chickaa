import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/**
 * Simulates a deploy: the server reads files from disk per request, so changing
 * dist/sw.js makes the browser see a new version on its next update check.
 */
const SW_PATH = new URL('../apps/web/dist/sw.js', import.meta.url);

test.describe('app update', () => {
  test.describe.configure({ mode: 'serial' });
  let original: string;

  test.beforeAll(async () => {
    original = await readFile(SW_PATH, 'utf8');
  });
  test.afterAll(async () => {
    await writeFile(SW_PATH, original);
  });

  test('a new deploy shows "New version ready" and Refresh activates it', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const firstScript = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);

    // "Deploy" a new version.
    await appendFile(SW_PATH, `\n// deploy ${Date.now()}\n`);
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());

    // The new worker waits; the user is asked.
    await expect(page.getByText('New version ready')).toBeVisible();
    expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true);

    // "Later" keeps the old version running.
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(page.getByText('New version ready')).toHaveCount(0);

    // Next check prompts again; Refresh activates + reloads.
    await page.reload();
    await expect(page.getByText('New version ready')).toBeVisible();
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Refresh' }).click()]);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          return !!reg && !reg.waiting && !!navigator.serviceWorker.controller;
        }),
      )
      .toBe(true);
    await expect(page.getByText('New version ready')).toHaveCount(0);
    expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(firstScript);
  });
});
