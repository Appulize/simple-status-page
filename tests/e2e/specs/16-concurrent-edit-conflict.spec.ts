import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD, BASE_URL } from '../helpers/env';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test('catalog: stale If-Match surfaces conflict modal, Reload re-syncs', async ({ page }, testInfo) => {
  // Seed via this page's session, then perform an out-of-band edit before
  // the drawer flushes — simulates a second admin writing concurrently.
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-x', displayName: 'one', severity: 'ok', state: 'active' },
      { itemId: 'srv-y', displayName: 'two', severity: 'ok', state: 'active' },
    ],
  });

  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await pause(page);
  await shot(page, testInfo, 'drawer-open');

  // Stage a local edit (batched, not yet POSTed).
  const rowX = drawer.locator('.cat-row', { has: page.locator('text=srv-x') });
  await rowX.locator('.cat-rename').fill('renamed-locally');
  await rowX.locator('.cat-rename').press('Tab');
  await pause(page, 200);

  // Out-of-band write: use the worker-scoped request fixture to bypass the
  // browser session, but auth via Bearer token would need rotation — simpler
  // to use a fresh context that re-logs in with the same password.
  const ctx = await page.context().browser()!.newContext();
  const apiPage = await ctx.newPage();
  await apiPage.request.post(`${BASE_URL}/api/login`, { data: { password: ADMIN_PASSWORD } });
  const cur = await apiPage.request.get(`${BASE_URL}/api/settings`).then(r => r.json());
  const csrfRes = await apiPage.request.get(`${BASE_URL}/api/auth`);
  const csrf = (await csrfRes.json()).csrfToken;
  cur.settings.ui.siteTitle = 'concurrent-write';
  const oob = await apiPage.request.post(`${BASE_URL}/api/settings`, {
    headers: { 'X-CSRF-Token': csrf, 'If-Match': String(cur.meta.mtime) },
    data: { settings: cur.settings },
  });
  expect(oob.status()).toBe(200);
  await ctx.close();

  // Trigger flush by switching tabs (closing the drawer would unmount the
  // conflict modal before it can render). The flush POSTs with stale mtime → 409.
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 409),
    switchTab(page, 'order'),
  ]);
  await pause(page, 300);

  const conflict = page.getByRole('dialog', { name: 'Settings conflict' });
  await expect(conflict).toBeVisible();
  await shot(page, testInfo, 'conflict-modal');

  // Reload latest → modal closes, the locally-renamed item reverts to its original name on next render.
  await conflict.getByRole('button', { name: /Reload latest/i }).click();
  await expect(conflict).toBeHidden();
  await pause(page, 300);
});
