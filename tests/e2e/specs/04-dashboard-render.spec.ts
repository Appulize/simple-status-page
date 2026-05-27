import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/env';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-ok',       displayName: 'app01.example.com',  severity: 'ok',       state: 'active', statusText: 'Operational' },
      { itemId: 'srv-degraded', displayName: 'queue01.example.com', severity: 'degraded', state: 'active', statusText: 'Elevated latency' },
      { itemId: 'srv-down',     displayName: 'db01.example.com',    severity: 'down',     state: 'active', statusText: 'Connection refused', error: 'Connection refused' },
      { itemId: 'srv-paused',   displayName: 'staging.example.com', severity: 'ok',       state: 'paused', statusText: 'Paused' },
    ],
  });
  // Log out so we render the public viewer-facing topbar in screenshots.
  await page.request.post(`${BASE_URL}/api/logout`);
});

test('hero counts, eyebrow tone, stackbar and card severities reflect seeded state', async ({ page }, testInfo) => {
  const stateResponse = page.waitForResponse(r => r.url().endsWith('/api/state'));
  await page.goto('/');
  await stateResponse;
  await pause(page, 500);
  await shot(page, testInfo, 'dashboard-full');

  // Hero: 1 degraded + 1 down → eyebrow tone is "down" (down beats degraded)
  await expect(page.locator('.hero')).toHaveAttribute('data-incident', 'true');
  await expect(page.locator('.hero-eyebrow')).toHaveAttribute('data-state', 'down');

  // Counters
  const counters = page.locator('.hero-meta dd');
  await expect(counters.nth(0)).toContainText(/1\s*\/\s*4/); // Operational 1 / 4
  await expect(counters.nth(1)).toHaveText(/^1$/);           // Degraded
  await expect(counters.nth(2)).toHaveText(/^1$/);           // Down
  await expect(counters.nth(3)).toHaveText(/^1$/);           // Paused

  // Stackbar present
  await expect(page.locator('.stackbar')).toBeVisible();

  // Cards
  const cards = page.locator('.card');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.card[data-severity="down"]')).toHaveCount(1);
  await expect(page.locator('.card[data-severity="degraded"]')).toHaveCount(1);
  await expect(page.locator('.card[data-state="paused"]')).toHaveCount(1);
  await expect(page.locator('.card .down-banner')).toContainText(/connection refused/i);

  await shot(page, testInfo, 'cards-detail');
});
