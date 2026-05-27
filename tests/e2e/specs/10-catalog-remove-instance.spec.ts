import { test, expect } from '@playwright/test';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { closeSettings, openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-a', displayName: 'app01', severity: 'ok', state: 'active' },
      { itemId: 'srv-b', displayName: 'app02', severity: 'ok', state: 'active' },
    ],
  });
});

test('catalog: remove instance erases its items from the dashboard', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);
  await expect(page.locator('.card')).toHaveCount(2);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await shot(page, testInfo, 'before-remove');

  // confirm() dialog is auto-accepted
  page.once('dialog', d => d.accept());
  await drawer.getByRole('button', { name: 'Remove' }).click();
  await pause(page, 300);
  await shot(page, testInfo, 'after-remove-click');

  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    closeSettings(page),
  ]);

  await expect(page.locator('.card')).toHaveCount(0);
  await pause(page, 400);
  await shot(page, testInfo, 'empty-dashboard');
});
