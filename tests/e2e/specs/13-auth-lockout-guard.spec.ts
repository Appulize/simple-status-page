import { test, expect } from '@playwright/test';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('auth: last-enabled method cannot be toggled off until another is enabled', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'auth');

  const formRow  = drawer.locator('.auth-method-row', { hasText: /Session login/ });
  const basicRow = drawer.locator('.auth-method-row', { hasText: /HTTP Basic/ });

  await expect(formRow.locator('.switch')).toBeDisabled();
  await expect(formRow.locator('.switch')).toHaveAttribute('title', /Enable another method first/i);
  await shot(page, testInfo, 'form-disabled');

  // Enable Basic
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    basicRow.locator('.switch').click(),
  ]);
  await pause(page, 300);

  // Now form's toggle becomes enabled because two methods are on.
  await expect(formRow.locator('.switch')).toBeEnabled();
  await shot(page, testInfo, 'form-enabled');
});
