import { test, expect } from '@playwright/test';
import { seedPasswordOnly } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedPasswordOnly(page.request);
});

test('protected tabs render "sign in" panel when unauthenticated', async ({ page }, testInfo) => {
  await page.goto('/');
  const drawer = await openSettings(page);
  await shot(page, testInfo, 'drawer-appearance');

  for (const tab of ['catalog', 'order', 'auth'] as const) {
    await switchTab(page, tab);
    await expect(drawer.getByText(/sign in with the admin password/i)).toBeVisible();
    await shot(page, testInfo, `${tab}-locked`);
  }
});
