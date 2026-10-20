import { expect, test } from '@playwright/test';
import { loginAs, MEMBER } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginAs(page, MEMBER);
});

test('the events list shows each event with what has been spent', async ({ page }) => {
  const card = page.getByRole('link', { name: /Freshers Party 2026/ });
  await expect(card).toContainText('₹11,230');
  await expect(card).toContainText('₹25,000');
});

test('the seeded Freshers event adds up', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();

  await expect(page.getByTestId('summary-budget')).toContainText('₹25,000');
  await expect(page.getByTestId('summary-collected')).toContainText('₹12,000');
  await expect(page.getByTestId('summary-spent')).toContainText('₹11,230');
  await expect(page.getByTestId('summary-remaining')).toContainText('₹13,770');
  await expect(page.getByTestId('summary-balance')).toContainText('₹770');
});

test('every entry links to its proof, and the proof loads', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  const entries = page.getByRole('list', { name: 'Entries' }).getByRole('listitem');
  await expect(entries).toHaveCount(10);

  const proofLinks = page.getByRole('link', { name: /^View proof/ });
  await expect(proofLinks).toHaveCount(10);
  const href = await proofLinks.first().getAttribute('href');
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\//);
});

test('a corrected entry stays visible but is marked as replaced', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  const printRows = page.getByRole('listitem').filter({ hasText: 'Print Point' });
  await expect(printRows).toHaveCount(2);
  await expect(printRows.filter({ hasText: '₹850' })).toContainText('Replaced by a correction');
  await expect(printRows.filter({ hasText: '₹580' })).toContainText('Typo: the bill says ₹580');
});

test('there is no way to edit or delete an entry', async ({ page }) => {
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page.getByRole('button', { name: /edit|delete|remove/i })).toHaveCount(0);
});
