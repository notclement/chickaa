import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse battery';
const uid = () => Math.random().toString(36).slice(2, 8);

async function register(page: Page, name: string, username: string) {
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('User ID').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // The one-time recovery code must be acknowledged before continuing.
  const code = await page.getByTestId('recovery-code').textContent();
  expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  const go = page.getByRole('button', { name: 'Let’s go' });
  await expect(go).toBeDisabled();
  await page.getByLabel(/I’ve saved it/).check();
  await go.click();
  return code!;
}

test('register → create trip → invite link + QR → friend joins → both see each other', async ({ page, browser }) => {
  const alice = `alice_${uid()}`;
  const bob = `bob_${uid()}`;

  // Alice signs up (no email/phone) and creates a trip.
  await page.goto('/');
  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await register(page, 'Alice', alice);
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible();
  await expect(page.getByText('No trips yet')).toBeVisible();

  await page.getByRole('link', { name: /New trip/ }).click();
  await page.getByLabel('Trip name').fill('Bali 2027');
  await page.getByLabel('Base currency').selectOption('SGD');
  await page.getByLabel('Start (optional)').fill('2027-03-01');
  await page.getByLabel('End (optional)').fill('2027-03-07');
  await page.getByRole('button', { name: 'Create trip' }).click();

  await expect(page.getByRole('heading', { name: 'Bali 2027' })).toBeVisible();
  await expect(page.getByText('SGD · Singapore dollar')).toBeVisible();
  await expect(page.getByText('Alice (you)')).toBeVisible();

  // Invite link + QR code.
  await page.getByRole('link', { name: /Invite people/ }).click();
  await page.getByLabel('Can be used by').selectOption({ label: '5 people' });
  await page.getByRole('button', { name: 'Create invite link' }).click();
  await expect(page.getByTestId('invite-qr').locator('svg')).toBeVisible();
  const url = (await page.getByTestId('invite-url').textContent())!;
  expect(url).toMatch(/\/join\/[A-Za-z0-9_-]{30,}$/);
  await expect(page.getByTestId('invite-row')).toHaveCount(1);

  // Bob, on another phone, opens the link, signs up and joins.
  const bobCtx = await browser.newContext();
  const bobPage = await bobCtx.newPage();
  await bobPage.goto(new URL(url).pathname);
  await expect(bobPage.getByText('Alice invited you to')).toBeVisible();
  await expect(bobPage.getByRole('heading', { name: 'Bali 2027' })).toBeVisible();
  await bobPage.getByRole('link', { name: 'Create account to join' }).click();
  await expect(bobPage.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await register(bobPage, 'Bob', bob);
  await bobPage.getByRole('button', { name: 'Join as Bob' }).click();
  await expect(bobPage.getByRole('heading', { name: 'Bali 2027' })).toBeVisible();
  await expect(bobPage.getByText('Bob (you)')).toBeVisible();
  await expect(bobPage.getByRole('listitem').filter({ hasText: 'Alice' }).filter({ hasText: 'owner' })).toBeVisible();
  // Members can't invite; they're told who can.
  await expect(bobPage.getByRole('link', { name: /Invite people/ })).toHaveCount(0);

  // Opening the link again doesn't duplicate membership.
  await bobPage.goto(new URL(url).pathname);
  await expect(bobPage.getByText('You’re already in this trip.')).toBeVisible();
  await bobCtx.close();

  // Alice sees Bob, and the link shows 1 of 5 used.
  await page.goto('/');
  await page.getByRole('link', { name: /Bali 2027/ }).click();
  await expect(page.getByText('People · 2')).toBeVisible();
  await page.getByRole('link', { name: /Invite people/ }).click();
  await expect(page.getByTestId('invite-row')).toContainText('1 joined of 5');
});

test('log out, log back in, and reset a forgotten password with the recovery code', async ({ page }) => {
  const user = `carol_${uid()}`;
  await page.goto('/register');
  const code = await register(page, 'Carol', user);

  await page.getByRole('link', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

  // Wrong password.
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('User ID').fill(user);
  await page.getByLabel('Password').fill('wrong password!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password');

  // Forgot password → recovery code.
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('User ID').fill(user);
  await page.getByLabel('Recovery code').fill(code.toLowerCase());
  await page.getByLabel('New password').fill('a whole new password');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  const newCode = await page.getByTestId('recovery-code').textContent();
  expect(newCode).not.toBe(code);
  await page.getByLabel(/I’ve saved it/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible();
});

test('signed-out visitors are sent to log in, then back to where they were going', async ({ page }) => {
  const user = `dan_${uid()}`;
  await page.goto('/trips/new');
  await expect(page).toHaveURL(/\/login\?next=%2Ftrips%2Fnew/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await register(page, 'Dan', user);
  await expect(page.getByRole('heading', { name: 'New trip' })).toBeVisible();
});

test('a bad invite link explains itself', async ({ page }) => {
  await page.goto('/join/this-is-not-a-real-invite-token');
  await expect(page.getByText('Invite not found')).toBeVisible();
  await expect(page.getByText(/isn’t valid/)).toBeVisible();
});
