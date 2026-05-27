import { test, expect } from '@playwright/test';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { closeSettings, openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-a', displayName: 'app01', severity: 'ok', state: 'active' },
      { itemId: 'srv-b', displayName: 'app02', severity: 'ok', state: 'active' },
      { itemId: 'srv-c', displayName: 'app03', severity: 'ok', state: 'active' },
    ],
  });
});

test('catalog: visibility toggle hides item, rename updates card title', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  await expect(page.locator('.card')).toHaveCount(3);
  await shot(page, testInfo, 'three-cards');

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await shot(page, testInfo, 'catalog-tab');

  // Hide srv-a + rename srv-b.
  const rowA = drawer.locator('.cat-row', { has: page.locator('text=srv-a') });
  await rowA.getByRole('checkbox', { name: 'Visible' }).uncheck();
  await pause(page, 200);

  const rowB = drawer.locator('.cat-row', { has: page.locator('text=srv-b') });
  await rowB.locator('.cat-rename').fill('queue-primary');
  await rowB.locator('.cat-rename').press('Tab');
  await pause(page, 200);
  await shot(page, testInfo, 'edits-staged');

  // Closing the drawer flushes batched edits via POST /api/settings.
  // The follow-up /api/state fetch races us, so just assert end state with auto-retry.
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    closeSettings(page),
  ]);

  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.locator('.card .card-title-inner h3')).toHaveText(['queue-primary', 'app03']);
  await pause(page, 400);
  await shot(page, testInfo, 'after-flush');
});
