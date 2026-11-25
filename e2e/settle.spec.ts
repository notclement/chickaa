import { expect, test } from '@playwright/test';
import { tripWithTwo } from './helpers.ts';

test('settle up: preview → finish trip → payer marks sent → recipient confirms → all settled', async ({ page, browser }) => {
  const { alice, bob, bobCtx, tripUrl } = await tripWithTwo(page, browser);
  const tripPath = new URL(tripUrl).pathname;

  // Alice pays S$80 dinner for both → Bob owes S$40.
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('80');
  await alice.getByLabel('What was it for?').fill('Dinner');
  await alice.getByRole('button', { name: /^Save/ }).click();
  await expect(alice.getByTestId('my-balance')).toHaveText('S$40.00');

  // Preview.
  await alice.getByTestId('settle-entry').click();
  await expect(alice.getByTestId('transfer-count')).toHaveText('1 transfer settles everyone');
  await expect(alice.getByText('Minimum possible')).toBeVisible();
  await expect(alice.getByTestId('transfer')).toContainText('Bob pays you');
  await expect(alice.getByTestId('transfer')).toContainText('S$40.00');

  // Bob (member) can't finish.
  await bob.goto(`${tripPath}/settle`);
  await expect(bob.getByRole('button', { name: 'Finish trip & settle up' })).toHaveCount(0);

  // Alice finishes the trip.
  alice.once('dialog', (d) => d.accept());
  await alice.getByRole('button', { name: 'Finish trip & settle up' }).click();
  await expect(alice.getByTestId('progress')).toHaveText('0 of 1 transfers confirmed');

  // Bob pays in his bank app and marks it sent.
  await bob.reload();
  await expect(bob.getByTestId('transfer')).toContainText('You pay Alice');
  await expect(bob.getByRole('button', { name: 'Copy 40.00' })).toBeVisible();
  await bob.getByRole('button', { name: 'I’ve sent it' }).click();
  await expect(bob.getByTestId('transfer')).toContainText('Sent · waiting for confirmation');
  await expect(bob.getByRole('button', { name: 'Got it ✓' })).toHaveCount(0); // payer can't confirm

  // Expenses are locked now.
  await bob.goto(tripPath);
  await expect(bob.getByRole('link', { name: /Add expense/ })).toHaveCount(0);
  await expect(bob.getByTestId('settle-entry')).toContainText('0 of 1 confirmed');

  // Alice confirms receipt → fully settled.
  await alice.reload();
  await alice.getByRole('button', { name: 'Got it ✓' }).click();
  await expect(alice.getByTestId('fully-settled')).toBeVisible();
  await expect(alice.getByText('Fully settled ✓')).toBeVisible();

  await alice.getByRole('button', { name: 'History' }).click();
  await expect(alice.getByText(/marked it as sent/)).toBeVisible();
  await expect(alice.getByText(/You confirmed receipt/)).toBeVisible();

  await bob.goto(tripPath);
  await expect(bob.getByTestId('settle-entry')).toContainText('All settled');
  await expect(bob.getByTestId('my-balance')).toHaveText('settled up');
  await bobCtx.close();
});
