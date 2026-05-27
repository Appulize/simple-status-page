import { test, expect } from '@playwright/test';
import { onboard } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await onboard(page.request);
});

test('stale cache surfaces the "Showing cached data" banner', async ({ page }, testInfo) => {
  // Intercept /api/state with a synthetic stale payload. Avoids racing the
  // server's background regen, which would replace stale data on the next poll.
  const staleSince = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
  await page.route('**/api/state', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        instanceId: 'inst-test',
        providerId: 'uptimerobot',
        itemId: 'srv-1',
        displayName: 'app01',
        state: 'active',
        severity: 'ok',
        statusText: 'Operational',
        lastSeenAt: staleSince,
        elements: [],
        error: null,
      }],
      meta: {
        generatedAt: staleSince,
        freshness: 'stale',
        staleSince,
        instanceErrors: { 'inst-test': 'upstream unreachable' },
        etag: 'stale-fixture',
      },
    }),
  }));

  await page.goto('/');
  await pause(page, 500);

  const banner = page.locator('.stale');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/showing cached data/i);
  await expect(banner).toContainText(/providers unreachable/i);
  await shot(page, testInfo, 'stale-banner');
});
