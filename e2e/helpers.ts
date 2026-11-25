import { expect, type Browser, type Page } from '@playwright/test';

export const PASSWORD = 'correct horse battery';
export const uid = () => Math.random().toString(36).slice(2, 8);

/** Fills the sign-up form and acknowledges the recovery code. */
export async function register(page: Page, name: string, username: string) {
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const code = await page.getByTestId('recovery-code').textContent();
  expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  await page.getByLabel(/I’ve saved it/).check();
  await page.getByRole('button', { name: 'Let’s go' }).click();
  return code!;
}

/** Alice creates a trip and Bob joins it. Returns both pages. */
export async function tripWithTwo(page: Page, browser: Browser, opts: { name?: string; currency?: string } = {}) {
  const name = opts.name ?? `Trip ${uid()}`;
  await page.goto('/register');
  await register(page, 'Alice', `alice_${uid()}`);
  await page.getByRole('link', { name: /New trip/ }).click();
  await page.getByLabel('Trip name').fill(name);
  await page.getByLabel('Base currency').selectOption(opts.currency ?? 'SGD');
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const tripUrl = page.url();

  await page.getByRole('link', { name: /Invite people/ }).click();
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const url = (await page.getByTestId('invite-url').textContent())!;

  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  await bob.goto(new URL(url).pathname);
  await bob.getByRole('link', { name: 'Create account to join' }).click();
  await register(bob, 'Bob', `bob_${uid()}`);
  await bob.getByRole('button', { name: 'Join as Bob' }).click();
  await expect(bob.getByRole('heading', { name })).toBeVisible();

  await page.goto(tripUrl);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return { alice: page, bob, bobCtx, tripUrl, name };
}
