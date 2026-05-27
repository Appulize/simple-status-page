import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  // Onboard then log out — page is unauthed, so the theme toggle takes the
  // per-viewer localStorage path. That's the path most visitors hit, and it
  // round-trips cleanly across reload (the admin/server path is exercised in
  // spec 08).
  await onboard(page.request);
  await page.request.post(`${BASE_URL}/api/logout`);
});

test('theme toggle flips light/dark and persists across reload (per-viewer)', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const html = page.locator('html');
  const initial = await html.getAttribute('data-theme');
  await shot(page, testInfo, `initial-${initial}`);

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const flipped = initial === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-theme', flipped);
  await pause(page);
  await shot(page, testInfo, `flipped-${flipped}`);

  await page.reload();
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await expect(html).toHaveAttribute('data-theme', flipped);
  await pause(page, 300);
  await shot(page, testInfo, `persisted-${flipped}`);
});
