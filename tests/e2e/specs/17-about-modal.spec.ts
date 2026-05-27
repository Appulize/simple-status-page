import { test, expect } from '@playwright/test';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('about modal: opens with version, ESC closes', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  await page.locator('.menuchip').click();
  const about = page.getByRole('dialog', { name: 'About' });
  await about.waitFor({ state: 'visible' });
  await pause(page);
  await shot(page, testInfo, 'about-open');

  await expect(about.locator('dt', { hasText: 'Version' })).toBeVisible();
  await expect(about.locator('dd.mono')).not.toHaveText('—');

  await page.keyboard.press('Escape');
  await about.waitFor({ state: 'hidden' });
  await pause(page);
  await shot(page, testInfo, 'about-closed');
});
