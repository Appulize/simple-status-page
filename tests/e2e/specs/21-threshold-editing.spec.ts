import { test, expect } from '@playwright/test';
import { seedAuthedWithItems, readSettings } from '../helpers/seed';
import { closeSettings, openSettings, switchTab, pause } from '../helpers/ui';
import { shot } from '../helpers/shot';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      {
        itemId: 'host01',
        displayName: 'host01',
        severity: 'ok',
        state: 'active',
        statusText: 'Operational',
        elements: [
          { type: 'gauge', key: 'cpu', value: 31.2, unit: '%' },
          { type: 'gauge', key: 'mem', value: 58.7, unit: '%' },
        ],
      },
    ],
  });
});

test('catalog: edit cpu thresholds, persist via flush, surface in itemConfig', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');
  await shot(page, testInfo, 'catalog-open');

  // Open the thresholds subpanel for host01.
  const row = drawer.locator('.cat-row', { has: page.locator('text=host01') }).first();
  await row.getByRole('button', { name: /edit thresholds/i }).click();
  await pause(page, 150);
  await shot(page, testInfo, 'thresholds-panel');

  // CPU + Mem rows visible.
  const panel = drawer.locator('.cat-thresholds').first();
  await expect(panel.locator('.cat-threshold-name')).toHaveText(['CPU %', 'Memory %']);

  // Enter overrides for CPU. Use Tab to fire blur — Playwright's Locator.blur()
  // doesn't reliably surface the React/Preact onBlur in this build.
  const cpuRow = panel.locator('.cat-threshold-row').first();
  await cpuRow.locator('input').nth(0).fill('50');
  await cpuRow.locator('input').nth(0).press('Tab');
  await cpuRow.locator('input').nth(1).fill('85');
  await cpuRow.locator('input').nth(1).press('Tab');
  await pause(page, 200);

  // Flush by switching tabs (a batched POST fires).
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    switchTab(page, 'order'),
  ]);
  await closeSettings(page);

  const cfg = readSettings();
  const entry = cfg.itemConfig?.['inst-test:host01'];
  expect(entry?.thresholdOverrides?.cpu).toEqual({ warn: 50, crit: 85 });
});

test('catalog: invalid threshold (warn > crit) is rejected by the validator', async ({ page }) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 300);

  const drawer = await openSettings(page);
  await switchTab(page, 'catalog');

  const row = drawer.locator('.cat-row', { has: page.locator('text=host01') }).first();
  await row.getByRole('button', { name: /edit thresholds/i }).click();
  await pause(page, 100);

  const cpuRow = drawer.locator('.cat-threshold-row').first();
  await cpuRow.locator('input').nth(0).fill('95'); // warn
  await cpuRow.locator('input').nth(0).press('Tab');
  await cpuRow.locator('input').nth(1).fill('50'); // crit
  await cpuRow.locator('input').nth(1).press('Tab');
  await pause(page, 200);

  // Server rejects warn > crit on flush.
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST'),
    switchTab(page, 'order'),
  ]);
  expect(resp.status()).toBe(400);
  const body = await resp.json();
  expect(body.error).toMatch(/warn must be ≤ crit/);
});
