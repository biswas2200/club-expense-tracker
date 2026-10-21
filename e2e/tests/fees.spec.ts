import { expect, test } from '@playwright/test';
import { ADMIN, loginAs, MEMBER } from './helpers';

test('the seeded Freshers fees show who still owes money', async ({ page }) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await page.getByRole('tab', { name: 'Fees' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Fees' });
  await expect(panel).toContainText('4 of 9 paid');
  await expect(panel).toContainText('₹500 per member');
  const row = (name: string) => panel.getByRole('row').filter({ hasText: name });
  await expect(row('Arjun Rao')).toContainText('Unpaid');
  await expect(row('Meera Joshi')).toContainText('Disputed');
  await expect(row('Rahul Das')).toContainText('Awaiting confirmation');
  await expect(row('Rahul Das')).toContainText('Paid by Rohan Mehta');
  await expect(row('Sneha Kulkarni')).toContainText('Paid');
  // People who still owe money come first.
  await expect(panel.getByRole('row').nth(1)).toContainText('Arjun Rao');
});

test('an admin sets a fee and records a payment made on someone else’s behalf', async ({
  page,
}) => {
  await loginAs(page, ADMIN);
  const name = `Fest night ${Date.now()}`;
  await page.getByRole('button', { name: 'New event' }).click();
  const create = page.getByRole('dialog', { name: 'New event' });
  await create.getByLabel('Event name').fill(name);
  await create.getByLabel('Budget (₹)').fill('10,000');
  await create.getByLabel('Fee per member (₹)').fill('500');
  await create.getByRole('button', { name: 'Create event' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('tab', { name: 'Fees' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Fees' })).toContainText('0 of 9 paid');

  await page.getByRole('button', { name: 'Add entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add entry' });
  await dialog.getByRole('radio', { name: 'Money in' }).check();
  await dialog.getByRole('radio', { name: 'Cash' }).check();
  await dialog.getByLabel('Amount (₹)').fill('500');
  await dialog.getByLabel('Club member').selectOption({ label: 'Rahul Das' });
  await expect(dialog.getByLabel('Received from')).toHaveValue('Rahul Das');
  await dialog.getByLabel('Someone else paid for them').check();
  await dialog.getByLabel('Paid by').selectOption({ label: 'Rohan Mehta' });
  await dialog.getByRole('button', { name: 'Save entry' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: 'Fees' }).click();
  const row = page
    .getByRole('tabpanel', { name: 'Fees' })
    .getByRole('row')
    .filter({ hasText: 'Rahul Das' });
  await expect(row).toContainText('Awaiting confirmation');
  await expect(row).toContainText('Paid by Rohan Mehta');
});

test('an event without a fee says so', async ({ page }) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: /Tech Fest 2026/ }).click();
  await page.getByRole('tab', { name: 'Fees' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Fees' })).toContainText('No fee for this event');
});
