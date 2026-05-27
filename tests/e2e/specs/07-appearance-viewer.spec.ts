import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-1', displayName: 'app01', severity: 'ok',       state: 'active' },
      { itemId: 'srv-2', displayName: 'app02', severity: 'degraded', state: 'active' },
    ],
  });
  await page.request.post(`${BASE_URL}/api/logout`);
});

test('viewer appearance toggles update the page live and Reset clears them', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  await expect(page.locator('.summarybar-wrap')).toBeVisible();
  await shot(page, testInfo, 'before-toggles');

  const drawer = await openSettings(page);

  // Toggle summary bar off
  await drawer.locator('.setting-row', { hasText: /Show summary bar/i }).locator('.switch').click();
  await pause(page);
  await expect(page.locator('.summarybar-wrap')).toBeHidden();
  await shot(page, testInfo, 'summarybar-off');

  // Toggle sparklines off
  await drawer.locator('.setting-row', { hasText: /Sparklines/i }).locator('.switch').click();
  await pause(page);
  await expect(page.locator('html')).toHaveAttribute('data-sparklines', 'false');
  await shot(page, testInfo, 'sparklines-off');

  // Reset: clears localStorage and reloads
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    drawer.getByRole('button', { name: /^Reset$/ }).click(),
  ]);
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);
  await expect(page.locator('.summarybar-wrap')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-sparklines', 'true');
  await shot(page, testInfo, 'after-reset');
});
