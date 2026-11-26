import { expect, test } from '@playwright/test';
import { register, uid } from './helpers.ts';

test('Supporter page: PayNow QR with my reference, Telegram message', async ({ page }) => {
  await page.goto('/register');
  const id = `sam_${uid()}`;
  await register(page, 'Sam', id);
  await page.goto('/account');
  await page.getByRole('link', { name: '💛 Support' }).click();
  await expect(page.getByRole('heading', { name: 'Become a Supporter' })).toBeVisible();
  await expect(page.getByText(/a bit manual for now/)).toBeVisible();
  const ref = (await page.getByTestId('paynow-reference').textContent())!;
  expect(ref).toMatch(/^NCC-[A-Z2-9]{8}$/);
  await expect(page.getByTestId('paynow-qr').locator('svg')).toBeVisible();
  const href = (await page.getByTestId('telegram-link').getAttribute('href'))!;
  expect(href.startsWith('https://t.me/mashpotatas?text=')).toBe(true);
  expect(decodeURIComponent(href)).toContain(ref);
  expect(decodeURIComponent(href)).toContain(`@${id}`);
});
