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
  // Several rows render dd.mono after Sprint 7 added Schema + Cache rebuilt —
  // disambiguate by walking from the dt label to its sibling dd.
  const versionDd = about.locator('dt', { hasText: 'Version' }).locator('xpath=following-sibling::dd[1]');
  const schemaDd  = about.locator('dt', { hasText: 'Schema' }).locator('xpath=following-sibling::dd[1]');
  await expect(versionDd).not.toHaveText('—');
  await expect(schemaDd).toHaveText(/^v\d+$/);
  await expect(about.getByRole('link', { name: /source on github/i })).toHaveAttribute('href', /github\.com\/appulize\/simple-status-page/);

  await page.keyboard.press('Escape');
  await about.waitFor({ state: 'hidden' });
  await pause(page);
  await shot(page, testInfo, 'about-closed');
});
