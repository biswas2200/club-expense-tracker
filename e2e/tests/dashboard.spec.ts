import { expect, test } from '@playwright/test';
import { loginAs, VIEWER } from './helpers';

test.beforeEach(async ({ page }) => {
  // The faculty viewer is not part of any payment, so every name shows as a name.
  await loginAs(page, VIEWER);
});

const ledgerRow = (page: import('@playwright/test').Page, text: string) =>
  page.getByRole('list', { name: 'Entries' }).getByRole('listitem').filter({ hasText: text });

test('the events list shows each event with what has been spent', async ({ page }) => {
  const card = page.getByRole('link', { name: /Freshers Party 2026/ });
  await expect(card).toContainText('₹11,430');
  await expect(card).toContainText('₹25,000');
});

test('the seeded Freshers event adds up', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();

  await expect(page.getByTestId('summary-budget')).toContainText('₹25,000');
  await expect(page.getByTestId('summary-collected')).toContainText('₹18,000');
  await expect(page.getByTestId('summary-spent')).toContainText('₹11,430');
  await expect(page.getByTestId('summary-remaining')).toContainText('₹13,570');
  await expect(page.getByTestId('summary-balance')).toContainText('₹6,570');
  await expect(page.getByTestId('summary-unverified')).toContainText('₹8,280');
  await expect(page.getByTestId('summary-unverified')).toContainText('6 entries');
  await expect(page.getByTestId('summary-disputed')).toContainText('1 entry');
});

test('every proof on file links to it, and the proof loads', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page.getByRole('list', { name: 'Entries' }).getByRole('listitem')).toHaveCount(16);

  // Four cash entries have no photo: three fees confirmed by the payer, and the tea stall.
  const proofLinks = page.getByRole('link', { name: /^View proof/ });
  await expect(proofLinks).toHaveCount(12);
  const href = await proofLinks.first().getAttribute('href');
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\//);
});

test('a corrected entry stays visible but is marked as replaced', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  const printRows = ledgerRow(page, 'Print Point');
  await expect(printRows).toHaveCount(2);
  await expect(printRows.filter({ hasText: '₹850' })).toContainText('Replaced by a correction');
  await expect(printRows.filter({ hasText: '₹580' })).toContainText('Typo: the bill says ₹580');
});

test('every entry shows who has verified it, or who still has to', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(ledgerRow(page, 'Sneha Kulkarni')).toContainText('Verified by Sneha Kulkarni');
  await expect(ledgerRow(page, 'Decor Shop')).toContainText('Verified by Arjun Rao');
  await expect(ledgerRow(page, 'Meera Joshi')).toContainText('Disputed by Meera Joshi');
  await expect(ledgerRow(page, 'Meera Joshi')).toContainText('₹200 is still due');
  await expect(ledgerRow(page, 'Karthik Iyer')).toContainText(
    'Waiting for Karthik Iyer to confirm',
  );
  await expect(ledgerRow(page, 'Rahul Das')).toContainText('Paid by Rohan Mehta');
  await expect(ledgerRow(page, 'Rahul Das')).toContainText('Waiting for Rohan Mehta to confirm');
  await expect(ledgerRow(page, 'Tea stall')).toContainText('Needs a bill');
  await expect(ledgerRow(page, 'Sound & Lights')).toContainText(
    'Waiting for another admin to check',
  );
});

test('there is no way to edit or delete an entry', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page.getByRole('button', { name: /edit|delete|remove/i })).toHaveCount(0);
});
