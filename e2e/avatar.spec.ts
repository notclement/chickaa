import { expect, test } from '@playwright/test';
import { statSync } from 'node:fs';
import { register, uid } from './helpers.ts';

const PHOTO = new URL('./fixtures/big-photo.jpg', import.meta.url).pathname;

test('profile photo is shrunk in the browser to a few KB before upload', async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Pat', `pat_${uid()}`);
  await page.getByRole('link', { name: 'Account' }).click();

  const uploads: number[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/auth/me/avatar') && r.method() === 'PUT') uploads.push(r.postDataBuffer()?.length ?? 0);
  });
  await page.getByLabel('Choose a profile photo').setInputFiles(PHOTO);
  await expect(page.getByTestId('avatar-info')).toContainText('Saved');

  const original = statSync(PHOTO).size;
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!).toBeLessThan(12 * 1024);
  expect(uploads[0]! * 10).toBeLessThan(original); // at least 10× smaller

  // The photo shows in the header and survives a reload.
  const headerImg = page.getByRole('link', { name: 'Account' }).locator('img');
  await expect(headerImg).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Account' }).locator('img')).toBeVisible();
  const dims = await page.getByRole('link', { name: 'Account' }).locator('img').evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight]);
  expect(dims).toEqual([128, 128]);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('link', { name: 'Account' }).locator('img')).toHaveCount(0);
});
