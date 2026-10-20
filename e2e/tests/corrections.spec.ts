import { expect, test } from '@playwright/test';
import { addEntry, ADMIN, createEventViaApi, loginAs, screenshotFile } from './helpers';

test('an admin corrects an amount; the original stays visible and totals use the fix', async ({
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
  });
  await expect(page.getByTestId('summary-spent')).toContainText('₹1,200');

  await page.getByRole('button', { name: 'Correct entry: Decor Shop, ₹1,200' }).click();
  const dialog = page.getByRole('dialog', { name: 'Correct entry' });
  await expect(dialog.getByLabel('Paid to')).toHaveValue('Decor Shop');
  await expect(dialog.getByLabel('Amount (₹)')).toHaveValue('1200');
  await dialog.getByLabel('Amount (₹)').fill('1,020');
  await dialog.getByLabel('Reason for correction').fill('Typed 1,200 instead of 1,020');
  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(dialog).toBeHidden();

  const rows = page.getByRole('list', { name: 'Entries' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: '₹1,200' })).toContainText('Replaced by a correction');
  await expect(rows.filter({ hasText: '₹1,020' })).toContainText('Typed 1,200 instead of 1,020');
  await expect(page.getByTestId('summary-spent')).toContainText('₹1,020');

  // Only the latest version can be corrected again.
  await expect(
    page.getByRole('button', { name: /^Correct entry: Decor Shop, ₹1,200$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Correct entry: Decor Shop, ₹1,020' }),
  ).toBeVisible();
});

test('history shows every version of an entry with who changed it and why', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000);
  await page.goto(`/events/${event.id}`);
  await addEntry(page, {
    direction: 'Money out',
    mode: 'Cash',
    amount: '850',
    party: 'Print Point',
  });

  await page.getByRole('button', { name: 'Correct entry: Print Point, ₹850' }).click();
  const fix = page.getByRole('dialog', { name: 'Correct entry' });
  await fix.getByLabel('Amount (₹)').fill('580');
  await fix.getByLabel('Reason for correction').fill('Bill says ₹580');
  await fix.getByLabel('New proof').setInputFiles(screenshotFile('bill.png'));
  await fix.getByRole('button', { name: 'Save correction' }).click();
  await expect(fix).toBeHidden();

  await page.getByRole('button', { name: 'History: Print Point, ₹580' }).click();
  const history = page.getByRole('dialog', { name: 'Entry history' });
  const versions = history.getByRole('listitem');
  await expect(versions).toHaveCount(2);
  await expect(versions.nth(0)).toContainText('₹850');
  await expect(versions.nth(1)).toContainText('₹580');
  await expect(versions.nth(1)).toContainText('Bill says ₹580');
  await expect(versions.nth(1)).toContainText(ADMIN);
});

test('a correction needs a reason', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000);
  await page.goto(`/events/${event.id}`);
  await addEntry(page, { direction: 'Money out', mode: 'UPI', amount: '400', party: 'Florist' });

  await page.getByRole('button', { name: 'Correct entry: Florist, ₹400' }).click();
  const dialog = page.getByRole('dialog', { name: 'Correct entry' });
  await dialog.getByLabel('Amount (₹)').fill('450');
  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Say why');
  await expect(page.getByTestId('summary-spent')).toContainText('₹400');
});

test('an admin can void a duplicate entry with an amount of 0', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000);
  await page.goto(`/events/${event.id}`);
  await addEntry(page, {
    direction: 'Money out',
    mode: 'UPI',
    amount: '999',
    party: 'Duplicate vendor',
  });

  await page.getByRole('button', { name: 'Correct entry: Duplicate vendor, ₹999' }).click();
  const dialog = page.getByRole('dialog', { name: 'Correct entry' });
  await dialog.getByLabel('Amount (₹)').fill('0');
  await dialog.getByLabel('Reason for correction').fill('Entered twice');
  await dialog.getByRole('button', { name: 'Save correction' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('listitem').filter({ hasText: 'Entered twice' })).toContainText(
    'Voided',
  );
  await expect(page.getByTestId('summary-spent')).toContainText('₹0');
});
