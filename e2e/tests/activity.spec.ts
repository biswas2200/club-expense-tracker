import { expect, test } from '@playwright/test';
import { ADMIN, createEventViaApi, loginAs, MEMBER, recordViaApi } from './helpers';

test('the activity tab shows who did what in this event', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await recordViaApi(page, event.id, { mode: 'upi' }, true);
  await page.goto(`/events/${event.id}`);
  await page.getByRole('tab', { name: 'Activity' }).click();

  const items = page.getByRole('tabpanel', { name: 'Activity' }).getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('Recorded ₹1,200 paid to Decor Shop by UPI');
  await expect(items.nth(0)).toContainText(ADMIN);
  await expect(items.nth(1)).toContainText(`Created ${event.name}`);
});

test('the activity page shows the whole club’s log to every member', async ({ page }) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(
    'Counted ₹1,220 cash in hand; expected ₹1,270, ₹50 short',
  );
  await expect(page.getByRole('main')).toContainText('Disputed ₹500 received from Meera Joshi');
});
