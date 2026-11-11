import { expect, test } from '@playwright/test';

test('E1: client connects to the server and shows "connected"', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-status')).toHaveText('connected', { timeout: 10_000 });
});

test('E2: page title is Domino', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Domino');
});
