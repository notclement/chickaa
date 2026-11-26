import { expect, test } from '@playwright/test';
import { register, uid } from './helpers.ts';

test('invite a friend: both people get a month as Supporter', async ({ page, browser }) => {
  await page.goto('/register');
  await expect(page.getByTestId('referral-banner')).toHaveCount(0);
  await register(page, 'Alice', `alice_${uid()}`);
  await page.goto('/account');
  await expect(page.getByTestId('supporter-badge')).toHaveCount(0);
  await page.getByRole('link', { name: /Invite a friend/ }).click();
  await expect(page.getByRole('heading', { name: 'Invite a friend' })).toBeVisible();
  await expect(page.getByTestId('referral-count')).toHaveText('0');
  const link = (await page.getByTestId('referral-url').textContent())!;
  expect(link).toMatch(/\/r\/[A-Z2-9]{8}$/);

  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  await bob.goto(new URL(link).pathname);
  await expect(bob).toHaveURL(/\/register$/);
  await expect(bob.getByTestId('referral-banner')).toBeVisible();
  await register(bob, 'Bob', `bob_${uid()}`);
  await bob.goto('/account');
  await expect(bob.getByTestId('supporter-badge')).toContainText('Supporter');
  await bobCtx.close();

  await page.reload();
  await expect(page.getByTestId('referral-count')).toHaveText('1');
  await page.goto('/account');
  await expect(page.getByTestId('supporter-badge')).toContainText('Supporter');
});
