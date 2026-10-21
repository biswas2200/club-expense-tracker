import { expect, test } from '@playwright/test';
import { addEntry, ADMIN, createEventViaApi, loginAs, MEMBER } from './helpers';

test('an admin creates an event from the events page', async ({ page }) => {
  await loginAs(page, ADMIN);
  const name = `Cultural night ${Date.now()}`;
  await page.getByRole('button', { name: 'New event' }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Event name').fill(name);
  await dialog.getByLabel('Budget (₹)').fill('15,000');
  await dialog.getByRole('button', { name: 'Create event' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByTestId('summary-budget')).toContainText('₹15,000');
  await expect(page.getByTestId('summary-spent')).toContainText('₹0');
  await expect(page.getByText('No entries yet')).toBeVisible();
});

test('an admin adds a UPI expense with a screenshot and the dashboard updates', async ({
  page,
}) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000);
  await page.goto(`/events/${event.id}`);

  await addEntry(page, {
    direction: 'Money out',
    mode: 'UPI',
    amount: '1,200',
    party: 'Decor Shop',
    txnId: '4321 8765 0001',
  });

  const row = page
    .getByRole('list', { name: 'Entries' })
    .getByRole('listitem')
    .filter({ hasText: 'Decor Shop' });
  await expect(row).toContainText('₹1,200');
  await expect(row).toContainText('UPI');
  await expect(row).toContainText(`Added by ${ADMIN}`);
  await expect(page.getByTestId('summary-spent')).toContainText('₹1,200');
  await expect(page.getByTestId('summary-remaining')).toContainText('₹8,800');

  const href = await row.getByRole('link', { name: /^View proof/ }).getAttribute('href');
  expect((await page.request.get(href!)).status()).toBe(200);
});

test('an admin records money collected in cash', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000);
  await page.goto(`/events/${event.id}`);

  await addEntry(page, {
    direction: 'Money in',
    mode: 'Cash',
    amount: '500',
    party: 'Karthik Iyer',
  });

  await expect(page.getByRole('listitem').filter({ hasText: 'Karthik Iyer' })).toContainText(
    'Cash',
  );
  await expect(page.getByTestId('summary-collected')).toContainText('₹500');
  await expect(page.getByTestId('summary-balance')).toContainText('₹500');
});

test('an entry cannot be saved without proof', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await page.goto(`/events/${event.id}`);

  const dialog = await addEntry(page, {
    direction: 'Money out',
    mode: 'UPI',
    amount: '300',
    party: 'Tea stall',
    withProof: false,
  });
  await expect(dialog.getByRole('alert')).toContainText('Attach a proof');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('No entries yet')).toBeVisible();
});

test('the form rejects an amount that is not a valid rupee value', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await page.goto(`/events/${event.id}`);

  const dialog = await addEntry(page, {
    direction: 'Money out',
    mode: 'UPI',
    amount: '12.345',
    party: 'Tea stall',
  });
  await expect(dialog.getByRole('alert')).toContainText('Enter an amount like 1200 or 1,200.50');
});

test('a member can see entries but has no add button', async ({ page }) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page.getByRole('heading', { name: 'Freshers Party 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add entry' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New event' })).toHaveCount(0);
});

test('cash can be recorded without a photo; it then needs a bill', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await page.goto(`/events/${event.id}`);
  await addEntry(page, {
    direction: 'Money out',
    mode: 'Cash',
    amount: '200',
    party: 'Tea stall',
    withProof: false,
  });
  const row = page
    .getByRole('list', { name: 'Entries' })
    .getByRole('listitem')
    .filter({ hasText: 'Tea stall' });
  await expect(row).toContainText('Needs a bill');
  await expect(row.getByRole('link', { name: /^View proof/ })).toHaveCount(0);
});
