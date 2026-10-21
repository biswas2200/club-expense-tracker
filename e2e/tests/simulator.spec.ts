import { expect, test, type Page } from '@playwright/test';
import { ADMIN, createEventViaApi, loginAs, MEMBER } from './helpers';

/** A member with no other questions from the bot waiting, so the ping in this test is theirs. */
const PAYER = 'Rahul Das';

async function openChat(page: Page, title: string) {
  await page.goto('/simulator');
  await page.getByRole('navigation', { name: 'Chats' }).getByRole('link', { name: title }).click();
  const thread = page.getByRole('region', { name: `Chat: ${title}` });
  await expect(thread).toBeVisible();
  return thread;
}

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
}

const lastMessage = (page: Page) =>
  page.getByRole('list', { name: 'Messages' }).getByRole('listitem').last();

test('a tagged group question about unpaid members gets the right list', async ({ page }) => {
  await loginAs(page, ADMIN);
  await page.getByRole('link', { name: 'Chat simulator' }).click();
  await expect(page.getByRole('heading', { name: 'Chat simulator' })).toBeVisible();

  await openChat(page, 'Sparks class group');
  await page.getByLabel('Send as').selectOption({ label: MEMBER });
  await send(page, '@NoCap who hasn’t paid for freshers?');

  const reply = lastMessage(page);
  await expect(reply).toContainText('NoCap');
  await expect(reply).toContainText('Freshers Party 2026');
  await expect(reply).toContainText('Paid: 4 of 9');
  await expect(reply).toContainText('Waiting for confirmation: 3');
  await expect(reply).toContainText('Not paid yet (2):');
  await expect(reply).toContainText('• Arjun Rao');
  await expect(reply).toContainText('• Meera Joshi (disputed)');
  // The question shows as Sneha's, above the bot's answer.
  await expect(
    page.getByRole('list', { name: 'Messages' }).getByRole('listitem').nth(-2),
  ).toContainText(MEMBER);
});

test('an admin saves a UPI payment by sending the screenshot', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await openChat(page, ADMIN);

  await page.getByRole('button', { name: 'Attach screenshot' }).click();
  const picker = page.getByRole('dialog', { name: 'Attach a screenshot' });
  await picker.getByRole('button', { name: /Paid ₹2,400 to Sri Ganesh Caterers/ }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole('img', { name: 'Screenshot to send' })).toBeVisible();
  await send(page, event.name);

  await expect(lastMessage(page)).toContainText('₹2,400 paid to Sri Ganesh Caterers by UPI');
  await expect(lastMessage(page)).toContainText(`Event: ${event.name}`);
  await expect(lastMessage(page)).toContainText('Reply 1 to save, 2 to fix.');
  await expect(
    page.getByRole('list', { name: 'Messages' }).getByRole('img', { name: 'Screenshot' }).last(),
  ).toBeVisible();

  await send(page, '1');
  await expect(lastMessage(page)).toContainText(`Saved ✓ It's in ${event.name}`);

  await page.goto(`/events/${event.id}`);
  const entry = page
    .getByRole('list', { name: 'Entries' })
    .getByRole('listitem')
    .filter({ hasText: 'Sri Ganesh Caterers' });
  await expect(entry).toContainText('₹2,400');
  await expect(entry).toContainText('via chat');
  await expect(entry.getByRole('link', { name: /^View proof/ })).toHaveCount(1);
});

test('the bot asks the member to confirm cash, and YES verifies it', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page, 10000, 500);
  await openChat(page, ADMIN);
  await send(page, `cash in 500 from ${PAYER.toLowerCase()} for ${event.name}`);
  await expect(lastMessage(page)).toContainText(
    `₹500 received from ${PAYER} (club member) in cash`,
  );
  await send(page, '1');
  await expect(lastMessage(page)).toContainText(`I’ve asked ${PAYER} to confirm it.`);

  await page.goto('/simulator');
  const payerChat = page.getByRole('navigation', { name: 'Chats' }).getByRole('link', {
    name: PAYER,
  });
  await expect(payerChat).toContainText('Waiting for a reply');
  await payerChat.click();
  await expect(lastMessage(page)).toContainText(
    `Hi Rahul, ${ADMIN} recorded that you paid ₹500 in cash for ${event.name}`,
  );
  await send(page, 'YES');
  await expect(lastMessage(page)).toContainText('Thanks, Rahul.');

  await page.goto(`/events/${event.id}?tab=fees`);
  await expect(
    page.getByRole('tabpanel', { name: 'Fees' }).getByRole('row').filter({ hasText: PAYER }),
  ).toContainText('Paid');
});

test('an admin fixes the amount before saving, then cancels', async ({ page }) => {
  await loginAs(page, ADMIN);
  const event = await createEventViaApi(page);
  await openChat(page, ADMIN);
  await page.getByRole('button', { name: 'Attach screenshot' }).click();
  await page
    .getByRole('dialog', { name: 'Attach a screenshot' })
    .getByRole('button', { name: /Paid ₹2,400 to Sri Ganesh Caterers/ })
    .click();
  await send(page, event.name);

  await send(page, '2');
  await expect(lastMessage(page)).toContainText('What should I fix?');
  await send(page, '1');
  await send(page, '2,500');
  await expect(lastMessage(page)).toContainText('₹2,500 paid to Sri Ganesh Caterers');
  await send(page, 'cancel');
  await expect(lastMessage(page)).toContainText('Cancelled. Nothing was saved.');
});

test('a screenshot that is already in the ledger is refused', async ({ page }) => {
  await loginAs(page, ADMIN);
  await openChat(page, ADMIN);
  await page.getByRole('button', { name: 'Attach screenshot' }).click();
  await page
    .getByRole('dialog', { name: 'Attach a screenshot' })
    .getByRole('button', { name: /Paid ₹1,200 to Decor Shop/ })
    .click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(lastMessage(page)).toContainText('is already recorded');
  await expect(lastMessage(page)).toContainText('Freshers Party 2026');
});
