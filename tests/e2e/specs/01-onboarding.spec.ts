import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD, BASE_URL, resetDataRoot } from '../helpers/env';
import { shot } from '../helpers/shot';

test.beforeEach(() => {
  // Fresh data root → server reads "first run" on next request.
  resetDataRoot();
});

test('first-run: setting the admin password completes onboarding', async ({ page }, testInfo) => {
  await page.goto('/');

  const onboard = page.getByRole('dialog', { name: 'First-run setup' });
  await expect(onboard).toBeVisible();
  await shot(page, testInfo, 'onboard-overlay');

  const [pw, confirm] = await onboard.locator('input[type="password"]').all();
  await pw.fill(ADMIN_PASSWORD);
  await confirm.fill(ADMIN_PASSWORD);
  await shot(page, testInfo, 'password-filled');

  const submit = onboard.getByRole('button', { name: /set password & continue/i });
  await expect(submit).toBeEnabled();

  const onboardResponse = page.waitForResponse(r => r.url().endsWith('/api/onboard') && r.request().method() === 'POST');
  await submit.click();
  const res = await onboardResponse;
  expect(res.status()).toBe(200);

  // Overlay closes and the page becomes the authenticated dashboard.
  await expect(onboard).toBeHidden();
  await shot(page, testInfo, 'post-onboard-dashboard');

  // Server agrees: not first-run anymore, session is authenticated.
  const auth = await page.request.get(`${BASE_URL}/api/auth`);
  const authJson = await auth.json();
  expect(authJson.firstRun).toBe(false);
  expect(authJson.authenticated).toBe(true);
});
