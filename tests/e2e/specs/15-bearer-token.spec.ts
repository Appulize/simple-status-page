import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('bearer token: enable, reveal, rotate, and the new token authorizes API calls', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'auth');

  const tokenRow = drawer.locator('.auth-method-row', { hasText: /API key/ });

  // Enable
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    tokenRow.locator('.switch').click(),
  ]);
  await pause(page, 300);
  await shot(page, testInfo, 'token-enabled');

  // Rotate → generates a new token and reveals it
  const rotateRes = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/token/rotate') && r.request().method() === 'POST' && r.status() === 200),
    tokenRow.getByRole('button', { name: /Rotate/i }).click(),
  ]);
  const json = await rotateRes[0].json();
  expect(json.token).toMatch(/^[a-f0-9]{64}$/);
  await pause(page, 300);
  await shot(page, testInfo, 'token-rotated');

  // Token input should now show the new value (revealed).
  const tokenInput = tokenRow.locator('input.mono').first();
  await expect(tokenInput).toHaveValue(json.token);

  // The revealed token authorizes a bearer-style call to /api/settings (CSRF-exempt).
  const settings = await page.request.get(`${BASE_URL}/api/settings`, {
    headers: { Authorization: `Bearer ${json.token}` },
  });
  expect(settings.status()).toBe(200);
});
