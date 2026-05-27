import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('admin appearance defaults save to server and apply to anonymous viewers', async ({ page, request }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await shot(page, testInfo, 'admin-appearance-tab');

  // Pick the violet accent swatch
  const violet = drawer.locator('.swatch[data-name="violet"]');
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/appearance') && r.request().method() === 'POST' && r.status() === 200),
    violet.click(),
  ]);
  await pause(page);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await shot(page, testInfo, 'violet-applied');

  // Confirm the server actually persisted the value by reading /api/config from a logged-out session.
  await page.request.post(`${BASE_URL}/api/logout`);
  const cfg = await request.get(`${BASE_URL}/api/config`).then(r => r.json());
  expect(cfg.appearance.accent).toBe('violet');
});
