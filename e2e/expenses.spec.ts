import { expect, test } from '@playwright/test';
import { tripWithTwo } from './helpers.ts';

test('add expenses (multi-payer, foreign currency, shares), see balances, edit and delete', async ({ page, browser }) => {
  const { alice, bob, bobCtx, tripUrl } = await tripWithTwo(page, browser);

  // 1. SGD 300 dinner, Alice paid 200 + Bob 100, split equally → each 150. Alice +50, Bob −50.
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('300');
  await alice.getByLabel('What was it for?').fill('Seafood dinner');
  await alice.getByRole('button', { name: 'Several people' }).click();
  await alice.getByLabel('Alice amount').fill('200');
  await alice.getByLabel('Bob amount').fill('90');
  await expect(alice.getByTestId('remaining')).toHaveText('S$10.00 left to assign');
  await alice.getByLabel('Bob amount').fill('100');
  await expect(alice.getByTestId('remaining')).toHaveText('✓ Adds up');
  await alice.getByRole('button', { name: /^Save/ }).click();

  await expect(alice.getByTestId('trip-total')).toHaveText('S$300.00');
  await expect(alice.getByTestId('my-balance')).toHaveText('S$50.00');
  await expect(alice.getByText('You get back', { exact: true })).toBeVisible();

  // 2. 1,200 THB hotel paid by Bob, split by shares Alice 2 : Bob 1 at 0.0375 → S$45: Alice 30, Bob 15.
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('1200');
  await alice.getByLabel('Currency').selectOption('THB');
  await alice.getByLabel('What was it for?').fill('Hotel');
  await expect(alice.getByTestId('rate-box')).toContainText('1 THB = 0.0375 SGD');
  await expect(alice.getByTestId('converted')).toHaveText('≈ S$45.00');
  await alice.getByRole('radio', { name: 'Bob' }).click();
  await alice.getByRole('tab', { name: 'Shares' }).click();
  await alice.getByRole('button', { name: 'More shares for Alice' }).click();
  await alice.getByRole('button', { name: /^Save/ }).click();

  // Alice: +50 − 30 = +20 ; Bob: −50 + 45 − 15 = −20.
  await expect(alice.getByTestId('trip-total')).toHaveText('S$345.00');
  await expect(alice.getByTestId('my-balance')).toHaveText('S$20.00');
  await expect(alice.getByTestId('expense-row').first()).toContainText('Hotel');
  await expect(alice.getByTestId('expense-row').first()).toContainText('≈ S$45.00');

  // Bob sees the same numbers from his side.
  await bob.goto(new URL(tripUrl).pathname);
  await expect(bob.getByText('You owe', { exact: true })).toBeVisible();
  await expect(bob.getByTestId('my-balance')).toHaveText('S$20.00');

  // 3. Manual rate + percentage split.
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('500');
  await alice.getByLabel('Currency').selectOption('THB');
  await alice.getByLabel('What was it for?').fill('Massage');
  await alice.getByRole('button', { name: 'Use my own rate' }).click();
  await alice.getByLabel('1 THB = ? SGD').fill('0.04');
  await expect(alice.getByTestId('converted')).toHaveText('≈ S$20.00');
  await alice.getByRole('tab', { name: '%' }).click();
  await alice.getByLabel('Alice percent').fill('50');
  await alice.getByLabel('Bob percent').fill('40');
  await expect(alice.getByTestId('remaining')).toHaveText('10% left');
  await alice.getByLabel('Bob percent').fill('50');
  await alice.getByRole('button', { name: /^Save/ }).click();
  // Alice paid 20, share 10 → +10 more → +30.
  await expect(alice.getByTestId('my-balance')).toHaveText('S$30.00');

  // 4. Open the expense, check the stored rate, edit it, then delete it.
  await alice.getByTestId('expense-row').filter({ hasText: 'Massage' }).click();
  await expect(alice.getByText('1 THB = 0.04 SGD')).toBeVisible();
  await expect(alice.getByText('Entered manually')).toBeVisible();
  await alice.getByRole('link', { name: 'Edit' }).click();
  await alice.getByLabel('What was it for?').fill('Thai massage');
  await alice.getByRole('button', { name: 'Save changes' }).click();
  await expect(alice.getByTestId('expense-row').filter({ hasText: 'Thai massage' })).toBeVisible();

  await alice.getByTestId('expense-row').filter({ hasText: 'Thai massage' }).click();
  await expect(alice.getByText(/You edited it/)).toBeVisible();
  alice.once('dialog', (d) => d.accept());
  await alice.getByRole('button', { name: 'Delete' }).click();
  await expect(alice.getByTestId('my-balance')).toHaveText('S$20.00');
  await expect(alice.getByTestId('expense-row').filter({ hasText: 'massage' })).toHaveCount(0);

  // 5. Balances screen.
  await alice.getByRole('link', { name: 'Details' }).click();
  await expect(alice.getByRole('heading', { name: 'Balances' })).toBeVisible();
  const rows = alice.getByTestId('balance-row');
  await expect(rows.filter({ hasText: 'You' })).toContainText('S$20.00');
  await expect(rows.filter({ hasText: 'Bob' })).toContainText('owes');
  await bobCtx.close();
});

test('owner can delete a trip only once everyone is settled', async ({ page, browser }) => {
  const { alice, bob, bobCtx, name } = await tripWithTwo(page, browser);

  // Alice pays S$20 split with Bob → Bob owes S$10.
  await alice.getByRole('link', { name: /Add expense/ }).click();
  await alice.getByLabel('Amount').fill('20');
  await alice.getByLabel('What was it for?').fill('Taxi');
  await alice.getByRole('button', { name: /^Save/ }).click();
  await expect(alice.getByTestId('my-balance')).toHaveText('S$10.00');

  await alice.getByRole('link', { name: /Settings/ }).click();
  await expect(alice.getByTestId('unsettled')).toContainText('Bob');
  await expect(alice.getByTestId('unsettled')).toContainText('owes S$10.00');
  await expect(alice.getByRole('button', { name: 'Delete trip…' })).toHaveCount(0);

  // Bob pays Alice back (as an expense for now; the settle-up flow comes later).
  await bob.reload();
  await bob.getByRole('link', { name: /Add expense/ }).click();
  await bob.getByLabel('Amount').fill('10');
  await bob.getByLabel('What was it for?').fill('Paying Alice back');
  await bob.getByRole('tab', { name: 'Equally' }).click();
  await bob.getByLabel('You', { exact: false }).first().uncheck(); // only Alice shares it
  await bob.getByRole('button', { name: /^Save/ }).click();
  await expect(bob.getByTestId('my-balance')).toHaveText('settled up');

  await alice.reload();
  await alice.getByRole('button', { name: 'Delete trip…' }).click();
  const del = alice.getByRole('button', { name: 'Delete for everyone' });
  await expect(del).toBeDisabled();
  await alice.getByLabel(/Type “/).fill(name);
  await del.click();
  await expect(alice.getByRole('heading', { name: 'My trips' })).toBeVisible();
  await expect(alice.getByText(name)).toHaveCount(0);

  await bob.goto('/');
  await expect(bob.getByText(name)).toHaveCount(0);
  await bobCtx.close();
});
