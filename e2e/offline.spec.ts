import { expect, test, type Page } from '@playwright/test';
import { tripWithTwo } from './helpers.ts';

async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
    }
  });
}

const dbNames = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''));

test('offline: last-loaded trips, expenses, balances and settle-up are viewable read-only; logout wipes them', async ({ page, browser }) => {
  const { alice, bob, bobCtx, tripUrl, name } = await tripWithTwo(page, browser);
  const tripPath = new URL(tripUrl).pathname;

  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('60');
  await alice.getByLabel('What was it for?').fill('Ramen');
  await alice.getByRole('button', { name: /^Save/ }).click();
  await expect(alice.getByTestId('owes-row')).toContainText('Bob owes you');
  await swReady(alice);

  // Visit the screens once while online.
  await alice.getByTestId('expense-row').first().click();
  await expect(alice.getByText('Paid by')).toBeVisible();
  await alice.goto(`${tripPath}/settle`);
  await expect(alice.getByTestId('transfer')).toBeVisible();
  await alice.goto('/');
  await expect(alice.getByRole('link', { name: new RegExp(name) })).toBeVisible();

  // ---- no signal ----
  await alice.context().setOffline(true);
  await alice.reload();
  await expect(alice.getByText('Offline · view only')).toBeVisible();
  await expect(alice.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await expect(alice.getByTestId('last-updated')).toBeVisible();
  await expect(alice.getByText('needs a connection').first()).toBeVisible(); // New trip disabled

  await alice.getByRole('link', { name: new RegExp(name) }).click();
  await expect(alice.getByRole('heading', { name })).toBeVisible();
  await expect(alice.getByTestId('trip-total')).toHaveText('S$60.00');
  await expect(alice.getByTestId('owes-row')).toContainText('Bob owes you');
  await expect(alice.getByText('Offline · view only')).toBeVisible();
  // Changes are disabled.
  await expect(alice.getByRole('link', { name: /Add expense/ })).toHaveCount(0);
  await expect(alice.getByText(/Add expense.*needs a connection/)).toBeVisible();

  await alice.getByTestId('expense-row').first().click();
  await expect(alice.getByText('Ramen').first()).toBeVisible();
  await expect(alice.getByRole('button', { name: 'Delete' })).toBeDisabled();

  await alice.goto(`${tripPath}/settle`); // deep link, served by the service worker + saved data
  await expect(alice.getByTestId('transfer')).toContainText('Bob pays you');
  await expect(alice.getByRole('button', { name: 'Finish trip & settle up' })).toBeDisabled();

  // ---- back online ----
  await alice.context().setOffline(false);
  await alice.goto(tripPath);
  await expect(alice.getByText('Offline · view only')).toHaveCount(0);
  await expect(alice.getByRole('link', { name: /Add expense/ })).toBeVisible();

  // Logging out deletes this user's offline copy.
  const me = await alice.evaluate(() => JSON.parse(localStorage.getItem('chickaa.user.last') ?? '{}').id as string);
  expect(await dbNames(alice)).toContain(`chickaa-${me}`);
  await alice.getByRole('link', { name: 'Account' }).click();
  await alice.getByRole('button', { name: 'Log out' }).click();
  await expect(alice.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect.poll(() => dbNames(alice)).not.toContain(`chickaa-${me}`);
  expect(await alice.evaluate(() => localStorage.getItem('chickaa.user.last'))).toBeNull();

  // Bob never opened the trip page on this phone after joining, but My trips prefetched it.
  await bob.goto('/');
  await expect(bob.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await swReady(bob);
  await bob.waitForTimeout(1500); // background prefetch
  await bob.context().setOffline(true);
  await bob.goto(tripPath);
  await expect(bob.getByTestId('owes-row')).toContainText('You owe Alice');
  await bobCtx.close();
});
