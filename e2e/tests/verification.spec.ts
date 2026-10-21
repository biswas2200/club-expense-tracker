import { expect, test } from '@playwright/test';
import {
  ADMIN,
  createEventViaApi,
  loginAs,
  MEMBER,
  memberIdOf,
  pageAs,
  recordViaApi,
  screenshotFile,
  SECOND_ADMIN,
} from './helpers';

test('a member confirms a payment recorded for them', async ({ page, browser }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000, 500);
  await recordViaApi(page, event.id, {
    direction: 'in',
    amountPaise: '50000',
    memberId: await memberIdOf(page, MEMBER),
  });

  const member = await pageAs(browser, MEMBER);
  await member.getByRole('link', { name: /My payments/ }).click();
  await expect(member.getByRole('heading', { name: 'My payments' })).toBeVisible();
  const row = member.getByRole('listitem').filter({ hasText: event.name });
  await expect(row).toContainText('₹500');
  await expect(row).toContainText(`Recorded by ${ADMIN}`);
  await row.getByRole('button', { name: 'Yes, this is right' }).click();
  await expect(row).toContainText('Verified');
  await expect(row.getByRole('button', { name: 'Yes, this is right' })).toHaveCount(0);
});

test('a member disputes a payment with a note, and admins see it', async ({ page, browser }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000, 500);
  await recordViaApi(page, event.id, {
    direction: 'in',
    amountPaise: '50000',
    memberId: await memberIdOf(page, MEMBER),
  });

  const member = await pageAs(browser, MEMBER);
  await member.getByRole('link', { name: /My payments/ }).click();
  const row = member.getByRole('listitem').filter({ hasText: event.name });
  await row.getByRole('button', { name: 'No, this is wrong' }).click();
  const dialog = member.getByRole('dialog', { name: 'Dispute this payment' });
  await dialog.getByRole('button', { name: 'Send dispute' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Say what is wrong');
  await dialog.getByLabel('What is wrong?').fill('I paid ₹300, not ₹500');
  await dialog.getByRole('button', { name: 'Send dispute' }).click();
  await expect(row).toContainText('Disputed');
  await expect(row).toContainText('I paid ₹300, not ₹500');

  await page.goto(`/events/${event.id}`);
  const ledger = page.getByRole('list', { name: 'Entries' }).getByRole('listitem');
  await expect(ledger.filter({ hasText: MEMBER })).toContainText(`Disputed by ${MEMBER}`);
  await expect(page.getByTestId('summary-disputed')).toContainText('1 entry');
});

test('another admin verifies cash spent by attaching the bill', async ({ page, browser }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await recordViaApi(page, event.id, { amountPaise: '30000', counterparty: 'Tea stall' });

  // The admin who recorded it cannot verify it.
  await page.goto(`/events/${event.id}`);
  await expect(page.getByRole('button', { name: /^Verify entry/ })).toHaveCount(0);

  const other = await pageAs(browser, SECOND_ADMIN);
  await other.goto(`/events/${event.id}`);
  const row = other
    .getByRole('list', { name: 'Entries' })
    .getByRole('listitem')
    .filter({ hasText: 'Tea stall' });
  await expect(row).toContainText('Needs a bill');
  await row.getByRole('button', { name: 'Verify entry: Tea stall, ₹300' }).click();
  const dialog = other.getByRole('dialog', { name: 'Verify entry' });
  await dialog.getByRole('radio', { name: 'It is correct' }).check();
  await dialog.getByRole('button', { name: 'Save check' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Attach the bill');
  await dialog.getByLabel('Bill photo').setInputFiles(screenshotFile('bill.png'));
  await dialog.getByRole('button', { name: 'Save check' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('Verified by you');
  await expect(row.getByRole('link', { name: /^View proof/ })).toHaveCount(1);

  // Everyone else sees the verifier's name.
  await page.reload();
  await expect(
    page
      .getByRole('list', { name: 'Entries' })
      .getByRole('listitem')
      .filter({ hasText: 'Tea stall' }),
  ).toContainText(`Verified by ${SECOND_ADMIN}`);
});

test('the header shows how many payments are waiting for me', async ({ page, browser }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000, 500);
  const member = await pageAs(browser, MEMBER);
  const link = member.getByRole('link', { name: /My payments/ });
  await expect(link).toHaveAttribute('data-pending', /^\d+$/);
  const before = Number(await link.getAttribute('data-pending'));

  await recordViaApi(page, event.id, {
    direction: 'in',
    amountPaise: '50000',
    memberId: await memberIdOf(page, MEMBER),
  });
  await member.reload();
  await expect(member.getByRole('link', { name: /My payments/ })).toHaveAttribute(
    'data-pending',
    String(before + 1),
  );
});
