import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD, BASE_URL } from '../helpers/env';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('change password: wrong current shows error, correct rotation destroys session', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'auth');

  const form = drawer.locator('form', { has: page.getByPlaceholder(/Current password/) });
  await form.getByPlaceholder(/Current password/).fill('wrong-current');
  await form.getByPlaceholder(/^New password/).fill('new-password-123');
  await form.getByPlaceholder(/Confirm new password/).fill('new-password-123');

  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/password') && r.request().method() === 'POST'),
    form.getByRole('button', { name: /Update/i }).click(),
  ]);
  await expect(form.locator('.form-error')).toBeVisible();
  await shot(page, testInfo, 'wrong-current');

  // Now succeed.
  await form.getByPlaceholder(/Current password/).fill(ADMIN_PASSWORD);
  await form.getByPlaceholder(/^New password/).fill('a-fresh-password-99');
  await form.getByPlaceholder(/Confirm new password/).fill('a-fresh-password-99');

  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/password') && r.request().method() === 'POST' && r.status() === 200),
    form.getByRole('button', { name: /Update/i }).click(),
  ]);
  await expect(form.locator('.form-success')).toBeVisible();
  await shot(page, testInfo, 'success');

  // Server destroys session — confirm via the API.
  await pause(page, 400);
  const auth = await page.request.get(`${BASE_URL}/api/auth`).then(r => r.json());
  expect(auth.authenticated).toBe(false);
  expect(auth.firstRun).toBe(false);

  // New password works.
  const login = await page.request.post(`${BASE_URL}/api/login`, { data: { password: 'a-fresh-password-99' } });
  expect(login.status()).toBe(200);
});
