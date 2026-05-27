import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-1', displayName: 'app01', severity: 'ok',       state: 'active' },
      { itemId: 'srv-2', displayName: 'app02', severity: 'degraded', state: 'active' },
    ],
  });
  await page.request.post(`${BASE_URL}/api/logout`);
});

test('simple/detailed mode toggle replaces cards with status pills and persists across reload', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  // Detailed by default → cards rendered
  await expect(page.locator('.card')).toHaveCount(2);
  await shot(page, testInfo, 'detailed-default');

  // Switch to Simple
  await page.getByRole('tab', { name: 'Simple' }).click();
  await pause(page);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'simple');
  await shot(page, testInfo, 'simple-mode');

  // Reload preserves choice (localStorage)
  await page.reload();
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'simple');
  await shot(page, testInfo, 'simple-after-reload');

  // Switch back to Detailed
  await page.getByRole('tab', { name: 'Detailed' }).click();
  await pause(page);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'detailed');
  await shot(page, testInfo, 'detailed-restored');
});
