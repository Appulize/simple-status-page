import { test, expect } from '@playwright/test';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { closeSettings, openSettings, switchTab, pause } from '../helpers/ui';

const BESZEL_URL      = process.env.E2E_BESZEL_URL      || '';
const BESZEL_EMAIL    = process.env.E2E_BESZEL_EMAIL    || '';
const BESZEL_PASSWORD = process.env.E2E_BESZEL_PASSWORD || '';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('add-instance wizard discovers and saves a real Beszel hub', async ({ page }, testInfo) => {
  test.skip(
    !BESZEL_URL || !BESZEL_EMAIL || !BESZEL_PASSWORD,
    'Set E2E_BESZEL_URL/EMAIL/PASSWORD in tests/e2e/.env to enable this spec.',
  );

  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await drawer.getByRole('button', { name: /\+ Add instance/i }).click();

  const wizard = page.getByRole('dialog', { name: 'Add instance' });
  await wizard.waitFor({ state: 'visible' });
  await pause(page);

  const beszel = wizard.getByRole('radio', { name: /Beszel/i });
  await beszel.waitFor({ state: 'visible' });
  await beszel.check();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  await pause(page);

  await wizard.locator('.form-row', { hasText: /^Hub URL/i }).locator('input').fill(BESZEL_URL);
  await wizard.locator('.form-row', { hasText: /^Username/i }).locator('input').fill(BESZEL_EMAIL);
  await wizard.locator('.form-row', { hasText: /^Password/i }).locator('input').fill(BESZEL_PASSWORD);
  await shot(page, testInfo, 'wizard-configured');

  const [discoverRes] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/discover') && r.request().method() === 'POST', { timeout: 30_000 }),
    wizard.getByRole('button', { name: /Test & discover/i }).click(),
  ]);
  expect(discoverRes.status()).toBe(200);
  const discoverJson = await discoverRes.json();
  expect(Array.isArray(discoverJson.nodes)).toBe(true);
  await pause(page, 500);
  await shot(page, testInfo, 'wizard-review');

  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    wizard.getByRole('button', { name: /Save instance/i }).click(),
  ]);
  await wizard.waitFor({ state: 'hidden' });
  await closeSettings(page);

  await page.waitForResponse(r => r.url().endsWith('/api/state'), { timeout: 30_000 });
  await pause(page, 1000);
  // At least one card should appear from the real upstream.
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 30_000 });
  await shot(page, testInfo, 'dashboard-with-live-data');
});
