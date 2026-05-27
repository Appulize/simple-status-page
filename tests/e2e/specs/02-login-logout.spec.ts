import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD, BASE_URL } from '../helpers/env';
import { seedPasswordOnly } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { loginThroughUI, openLogin, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedPasswordOnly(page.request);
});

test('login modal: wrong password shows error, correct password authenticates', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await shot(page, testInfo, 'lock-icon-visible');

  const modal = await openLogin(page);
  await shot(page, testInfo, 'login-modal-open');

  // Wrong password
  await modal.getByLabel('Password').fill('definitely-not-the-password');
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST'),
    modal.getByRole('button', { name: /continue/i }).click(),
  ]);
  await expect(modal.locator('.form-error')).toContainText(/incorrect/i);
  await pause(page);
  await shot(page, testInfo, 'wrong-password-error');

  // Correct password
  await modal.getByLabel('Password').fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST' && r.status() === 200),
    modal.getByRole('button', { name: /continue/i }).click(),
  ]);
  await expect(modal).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await shot(page, testInfo, 'authenticated');

  // Sign out
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await pause(page);
  await shot(page, testInfo, 'after-logout');

  const auth = await page.request.get(`${BASE_URL}/api/auth`).then(r => r.json());
  expect(auth.authenticated).toBe(false);
  expect(auth.firstRun).toBe(false);
});
