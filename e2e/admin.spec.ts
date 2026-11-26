import { expect, test } from '@playwright/test';
import { PASSWORD, register, uid } from './helpers.ts';

test('reserved IDs, admin created with the one-time code, all-trips list with tags, read-only trip view', async ({ page, browser }) => {
  // Look-alike admin IDs are refused while typing.
  await page.goto('/register');
  await expect(page.getByText('It can’t be changed later.')).toBeVisible(); // ID vs display name explained
  await expect(page.getByTestId('made-by').getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://www.linkedin.com/in/clementsg/');
  await page.getByLabel('User ID').fill('adm1n');
  await expect(page.getByText('That ID is reserved. Please pick another')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();

  // Alice makes a trip with an expense (→ On-going) and an empty one (→ Active).
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  await alice.goto('/register');
  const aliceId = `alice_${uid()}`;
  await register(alice, 'Alice', aliceId);
  const busy = `Busy ${uid()}`;
  const empty = `Empty ${uid()}`;
  for (const name of [empty, busy]) {
    await alice.goto('/trips/new');
    await alice.getByLabel('Trip name').fill(name);
    await alice.getByRole('button', { name: 'Create trip' }).click();
    await expect(alice.getByRole('heading', { name })).toBeVisible();
  }
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('25');
  await alice.getByLabel('What was it for?').fill('Lunch');
  await alice.getByRole('button', { name: /^Save/ }).click();
  await expect(alice.getByTestId('trip-total')).toHaveText('S$25.00');
  await aliceCtx.close();

  // The real admin ID needs the setup code (local runs may already have it: then log in).
  await page.getByLabel('User ID').fill('admin');
  await expect(page.getByLabel('Admin setup code')).toBeVisible();
  await page.getByLabel('Display name').fill('Admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Admin setup code').fill('wrong-code');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(/reserved|taken/).first()).toBeVisible();
  await page.getByLabel('Admin setup code').fill('e2e-admin-code');
  await page.getByRole('button', { name: 'Create account' }).click();
  const created = await page.getByTestId('recovery-code').isVisible({ timeout: 3000 }).catch(() => false);
  if (created) {
    await page.getByLabel(/I’ve saved it/).check();
    await page.getByRole('button', { name: 'Let’s go' }).click();
  } else {
    await page.goto('/login');
    await page.getByLabel('User ID').fill('admin');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
  }

  // Admin area.
  await page.getByRole('link', { name: 'Admin: all trips' }).click();
  await expect(page.getByRole('heading', { name: 'All trips' })).toBeVisible();
  await expect(page.getByTestId('admin-trip').filter({ hasText: busy }).getByTestId('trip-tag')).toHaveText('On-going');
  await expect(page.getByTestId('admin-trip').filter({ hasText: empty }).getByTestId('trip-tag')).toHaveText('Active');

  // Open it: read-only.
  await page.getByTestId('admin-trip').filter({ hasText: busy }).getByRole('link').click();
  await expect(page.getByTestId('admin-view')).toBeVisible();
  await expect(page.getByTestId('trip-total')).toHaveText('S$25.00');
  await expect(page.getByRole('link', { name: /Add expense/ })).toHaveCount(0);
  await page.getByTestId('expense-row').first().click();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  // Users tab: every account with the trips under it.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
  await page.getByLabel('Search users').fill(aliceId);
  const row = page.getByTestId('admin-user').filter({ hasText: `@${aliceId}` });
  // Every user shows their ref code; typing any middle part finds them, live.
  const refText = (await row.getByTestId('user-ref').textContent())!;
  expect(refText).toMatch(/^CHICKAA-[A-Z2-9]{8}$/);
  const middle = refText.slice('CHICKAA-'.length + 2, 'CHICKAA-'.length + 5).toLowerCase();
  await page.getByLabel('Search users').fill(middle);
  await expect(row).toBeVisible();
  await expect(row.locator('mark')).toHaveText(middle.toUpperCase());
  await page.getByLabel('Search users').fill(aliceId);
  await expect(row.getByTestId('user-trip-count')).toHaveText('2 trips');
  await row.locator('summary').click();
  // Supporter controls.
  const status = row.getByTestId('supporter-status');
  await expect(status).toHaveText('No');
  await row.getByRole('button', { name: '+1 month' }).click();
  await expect(status).toHaveText(/^Yes, until /);
  await row.getByRole('button', { name: 'Lifetime' }).click();
  await expect(status).toHaveText('Lifetime');
  await expect(row.getByTestId('supporter-badge')).toContainText('lifetime');
  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(status).toHaveText('No');
  await expect(row.getByTestId('admin-user-trip').filter({ hasText: busy }).getByTestId('trip-tag')).toHaveText('On-going');
  await row.getByTestId('admin-user-trip').filter({ hasText: empty }).click();
  await expect(page.getByTestId('admin-view')).toBeVisible();

  // Permanently delete a test trip from the list.
  await page.goto('/admin');
  const card = page.getByTestId('admin-trip').filter({ hasText: empty });
  await card.getByRole('button', { name: 'Delete permanently…' }).click();
  const forever = card.getByRole('button', { name: 'Delete forever' });
  await expect(forever).toBeDisabled();
  await card.getByLabel(`Type “${empty}” to confirm`).fill(empty);
  await forever.click();
  await expect(page.getByTestId('admin-trip').filter({ hasText: empty })).toHaveCount(0);
  await expect(page.getByTestId('admin-trip').filter({ hasText: busy })).toHaveCount(1);

  // Disable an account → it moves to the Disabled folder and their app turns read-only.
  const deeCtx = await browser.newContext();
  const dee = await deeCtx.newPage();
  const deeId = `dee_${uid()}`;
  await dee.goto('/register');
  await register(dee, 'Dee', deeId);
  await page.goto('/admin?tab=users');
  await page.getByLabel('Search users').fill(deeId);
  const deeRow = page.getByTestId('admin-user').filter({ hasText: `@${deeId}` });
  await deeRow.locator('summary').click();
  await deeRow.getByRole('button', { name: 'Disable account…' }).click();
  await deeRow.getByLabel('Private note (optional)').fill('testing');
  await deeRow.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.getByTestId('admin-user').filter({ hasText: `@${deeId}` })).toHaveCount(0); // left the Active folder
  await page.getByRole('button', { name: /Disabled · / }).click();
  await expect(page.getByTestId('admin-user').filter({ hasText: `@${deeId}` })).toHaveCount(1);

  await dee.reload();
  await expect(dee.getByTestId('disabled-banner')).toContainText('PM @mashpotatas on Telegram');
  await expect(dee.getByRole('link', { name: /New trip/ })).toHaveCount(0); // greyed out, not a link

  // Enable again.
  const back = page.getByTestId('admin-user').filter({ hasText: `@${deeId}` });
  await back.locator('summary').click();
  await back.getByRole('button', { name: 'Enable account' }).click();
  await expect(page.getByTestId('admin-user').filter({ hasText: `@${deeId}` })).toHaveCount(0);
  await dee.reload();
  await expect(dee.getByTestId('disabled-banner')).toHaveCount(0);
  await deeCtx.close();
});
