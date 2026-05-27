import { test, expect } from '@playwright/test';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('add-instance wizard surfaces upstream errors inline (502)', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await drawer.getByRole('button', { name: /\+ Add instance/i }).click();

  const wizard = page.getByRole('dialog', { name: 'Add instance' });
  await wizard.waitFor({ state: 'visible' });
  await pause(page);
  await shot(page, testInfo, 'wizard-step1');

  // Step 1 — Beszel (a provider with a URL field we can point at a closed port).
  const beszel = wizard.getByRole('radio', { name: /Beszel/i });
  await beszel.waitFor({ state: 'visible' });
  await beszel.check();
  await wizard.getByRole('button', { name: /^Next$/ }).click();
  await pause(page);
  await shot(page, testInfo, 'wizard-step2');

  // Step 2 — fill in deliberately unreachable hub. The wizard renders plain
  // <label> text (no for=), so target the inputs via their form-row sibling.
  await wizard.locator('.form-row', { hasText: /^Hub URL/i }).locator('input').fill('http://127.0.0.1:1');
  await wizard.locator('.form-row', { hasText: /^Username/i }).locator('input').fill('e2e@example.com');
  await wizard.locator('.form-row', { hasText: /^Password/i }).locator('input').fill('not-a-real-password');

  const [discoverRes] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/discover') && r.request().method() === 'POST'),
    wizard.getByRole('button', { name: /Test & discover/i }).click(),
  ]);
  expect(discoverRes.status()).toBeGreaterThanOrEqual(400);
  await pause(page);

  await expect(wizard.locator('.form-error')).toBeVisible();
  await shot(page, testInfo, 'wizard-error');
});
