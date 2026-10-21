import { expect, test } from '@playwright/test';
import { ADMIN, createEventViaApi, loginAs, MEMBER, recordViaApi } from './helpers';

test('the seeded cash box came up ₹50 short', async ({ page }) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await page.getByRole('tab', { name: 'Cash' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Cash' });
  await expect(panel.getByTestId('cash-expected')).toContainText('₹1,270');
  await expect(panel.getByTestId('cash-last')).toContainText('₹1,220');
  await expect(panel.getByTestId('cash-last')).toContainText('₹50 short');
  await expect(panel.getByTestId('cash-last')).toContainText('Rohan Mehta');
  // Members can look but not count.
  await expect(panel.getByRole('button', { name: 'Record cash count' })).toHaveCount(0);
});

test('an admin counts the cash box: short first, then matching', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await recordViaApi(page, event.id, {
    direction: 'in',
    amountPaise: '100000',
    counterparty: 'Class fund',
  });
  await recordViaApi(page, event.id, {
    direction: 'out',
    amountPaise: '30000',
    counterparty: 'Tea stall',
  });
  await page.goto(`/events/${event.id}`);
  await page.getByRole('tab', { name: 'Cash' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Cash' });
  await expect(panel.getByTestId('cash-expected')).toContainText('₹700');
  await expect(panel).toContainText('No count yet');

  for (const [counted, expected] of [
    ['650', '₹50 short'],
    ['700', 'Matches'],
  ] as const) {
    await panel.getByRole('button', { name: 'Record cash count' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record cash count' });
    await dialog.getByLabel('Cash counted (₹)').fill(counted);
    await dialog.getByRole('button', { name: 'Save count' }).click();
    await expect(dialog).toBeHidden();
    await expect(panel.getByTestId('cash-last')).toContainText(expected);
  }
  await expect(panel.getByRole('table').getByRole('row')).toHaveCount(3);
});
