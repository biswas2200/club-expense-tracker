import { expect, test } from '@playwright/test';
import { ADMIN, loginAs, VIEWER } from './helpers';

test('sends a logged-out visitor to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Who is using NoCap?' })).toBeVisible();
});

test('lists people by role on the dev login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('region', { name: 'Admins' }).getByRole('button')).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Members' }).getByRole('button')).toHaveCount(6);
  await expect(page.getByRole('region', { name: 'Viewers' }).getByRole('button')).toHaveCount(1);
});

test('a viewer can look but not add anything, and can log out', async ({ page }) => {
  await loginAs(page, VIEWER);
  await expect(page.getByRole('banner')).toContainText(VIEWER);
  await expect(page.getByRole('banner')).toContainText('Viewer');
  await expect(page.getByRole('button', { name: 'New event' })).toHaveCount(0);

  await page.getByRole('link', { name: /Freshers Party 2026/ }).click();
  await expect(page.getByRole('heading', { name: 'Freshers Party 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add entry' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Correct/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('an admin sees who they are logged in as', async ({ page }) => {
  await loginAs(page, ADMIN);
  await expect(page.getByRole('banner')).toContainText(ADMIN);
  await expect(page.getByRole('banner')).toContainText('Admin');
});
