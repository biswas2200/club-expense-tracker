import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ADMIN, loginAs, MEMBER } from './helpers';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

test('every logged-in page has a Report a bug link to a prefilled GitHub issue', async ({
  page,
}) => {
  await loginAs(page, MEMBER);
  await page.getByRole('link', { name: 'Activity' }).click();

  const link = page.getByRole('link', { name: 'Report a bug' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  const url = new URL((await link.getAttribute('href'))!);
  expect(url.origin + url.pathname).toBe(
    'https://github.com/biswas2200/club-expense-tracker/issues/new',
  );
  expect(url.searchParams.get('template')).toBe('bug_report.yml');
  expect(url.searchParams.get('version')).toBe(version);
  expect(url.searchParams.get('page')).toBe('/activity');
  expect(url.searchParams.get('environment')).toContain('Role: member');
});

test('the link follows the page you are on and never carries your name', async ({ page }) => {
  await loginAs(page, ADMIN);
  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page).toHaveURL(/\/events\/\w+$/);

  const link = page.getByRole('link', { name: 'Report a bug' });
  const path = new URL(page.url()).pathname;
  await expect(link).toHaveAttribute('href', new RegExp(`page=${encodeURIComponent(path)}&`));
  const href = (await link.getAttribute('href'))!;
  expect(decodeURIComponent(href)).not.toContain(ADMIN);
});
