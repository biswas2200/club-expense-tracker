import { expect, type Browser, type Page } from '@playwright/test';
import { placeholderPng } from '../../server/src/lib/placeholderPng';

export const ADMIN = 'Priya Nair';
export const SECOND_ADMIN = 'Arjun Rao';
export const MEMBER = 'Sneha Kulkarni';
export const VIEWER = 'Prof. S. Kavitha';

export async function loginAs(page: Page, name: string) {
  await page.goto('/login');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
}

/** Each test makes its own event so tests never depend on each other's entries. */
export async function createEventViaApi(page: Page, budgetRupees = 10000, feeRupees = 0) {
  const name = `Test event ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const res = await page.request.post('/api/events', {
    data: { name, budgetPaise: budgetRupees * 100, feePaise: feeRupees * 100 },
  });
  expect(res.status()).toBe(201);
  const event = (await res.json()) as { id: string; name: string };
  return event;
}

export function screenshotFile(name = 'upi-screenshot.png') {
  return { name, mimeType: 'image/png', buffer: placeholderPng([37, 99, 235]) };
}

/** Fills and submits the add-entry dialog. */
export async function addEntry(
  page: Page,
  entry: {
    direction: 'Money out' | 'Money in';
    mode: 'UPI' | 'Cash';
    amount: string;
    party: string;
    txnId?: string;
    withProof?: boolean;
  },
) {
  await page.getByRole('button', { name: 'Add entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add entry' });
  await dialog.getByRole('radio', { name: entry.direction }).check();
  await dialog.getByRole('radio', { name: entry.mode }).check();
  await dialog.getByLabel('Amount (₹)').fill(entry.amount);
  await dialog
    .getByLabel(entry.direction === 'Money out' ? 'Paid to' : 'Received from')
    .fill(entry.party);
  if (entry.txnId) await dialog.getByLabel('UPI transaction ID').fill(entry.txnId);
  if (entry.withProof !== false) await dialog.getByLabel('Proof').setInputFiles(screenshotFile());
  await dialog.getByRole('button', { name: 'Save entry' }).click();
  return dialog;
}

export const SECOND_MEMBER = 'Karthik Iyer';

/** Looks up a person's id through the API (the page must be logged in). */
export async function memberIdOf(page: Page, name: string) {
  const res = await page.request.get('/api/members');
  const people = (await res.json()) as { id: string; name: string }[];
  return people.find((p) => p.name === name)!.id;
}

/** Records an entry through the API, the way the form does. */
export async function recordViaApi(
  page: Page,
  eventId: string,
  fields: Record<string, string>,
  withProof = false,
) {
  const res = await page.request.post(`/api/events/${eventId}/entries`, {
    multipart: {
      direction: 'out',
      mode: 'cash',
      amountPaise: '120000',
      counterparty: 'Decor Shop',
      occurredAt: '2026-10-14',
      ...fields,
      ...(withProof ? { proof: screenshotFile() } : {}),
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

/** A second person in their own browser context, already logged in. */
export async function pageAs(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, name);
  return page;
}
