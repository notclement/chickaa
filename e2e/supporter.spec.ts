import { expect, test } from '@playwright/test';
import { register, uid } from './helpers.ts';

test('Supporter page: PayNow QR with my reference, Telegram message', async ({ page }) => {
  await page.goto('/register');
  const id = `sam_${uid()}`;
  await register(page, 'Sam', id);
  await page.goto('/account');
  await page.getByRole('link', { name: '💛 Support' }).click();
  await expect(page.getByRole('heading', { name: 'Become a Supporter' })).toBeVisible();
  await expect(page.getByText(/chip in S\$5 towards development/)).toBeVisible(); // spacing around the amount
  await expect(page.getByTestId('supporter-perks')).toContainText('Export trips');
  const ref = (await page.getByTestId('paynow-reference').textContent())!;
  expect(ref).toMatch(/^CHICKAA-[A-Z2-9]{8}$/);
  await expect(page.getByTestId('paynow-qr').locator('svg')).toBeVisible();
  const href = (await page.getByTestId('telegram-link').getAttribute('href'))!;
  expect(href.startsWith('https://t.me/mashpotatas?text=')).toBe(true);
  expect(decodeURIComponent(href)).toContain(ref);
  expect(decodeURIComponent(href)).toContain(`Just transferred you S$5 to show my support for ChickAA\nHere is my reference code: ${ref}\nThank you!`);
});
