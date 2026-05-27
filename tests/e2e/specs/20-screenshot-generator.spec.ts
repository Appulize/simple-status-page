/**
 * Generates the README's hero screenshot from a deterministic seeded dataset.
 * Output: docs/screenshots/dashboard-dark.png (committed).
 *
 * Run via `npm run test:e2e -- specs/20-screenshot-generator.spec.ts` or as
 * part of the full suite. Re-running overwrites the existing PNG.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BASE_URL, REPO_ROOT } from '../helpers/env';
import { seedAuthedWithItems } from '../helpers/seed';
import { pause } from '../helpers/ui';

const OUT_DIR = resolve(REPO_ROOT, 'docs', 'screenshots');

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      {
        itemId: 'web01',
        displayName: 'web01.example.com',
        severity: 'ok',
        state: 'active',
        statusText: 'Operational',
        elements: [
          { type: 'gauge',   key: 'cpu',  value: 31.2, unit: '%' },
          { type: 'gauge',   key: 'mem',  value: 58.7, unit: '%' },
          { type: 'gauge',   key: 'disk', value: 44.0, unit: '%' },
        ],
      },
      {
        itemId: 'api01',
        displayName: 'api.example.com',
        severity: 'ok',
        state: 'active',
        statusText: 'Operational',
        elements: [
          { type: 'counter', key: 'response_time', value: 184, unit: 'ms',
            history: [220, 180, 195, 210, 170, 165, 200, 180, 175, 184] },
          { type: 'uptime', key: 'uptime', windows: [
            { window: '24h', ratio: 100 },
            { window: '7d',  ratio: 99.98 },
            { window: '30d', ratio: 99.91 },
            { window: '90d', ratio: 99.87 },
          ] },
        ],
      },
      {
        itemId: 'queue01',
        displayName: 'queue01.example.com',
        severity: 'degraded',
        state: 'active',
        statusText: 'Elevated latency',
        elements: [
          { type: 'gauge', key: 'cpu', value: 86.4, unit: '%' },
          { type: 'gauge', key: 'mem', value: 72.0, unit: '%' },
        ],
      },
      {
        itemId: 'db01',
        displayName: 'db01.example.com',
        severity: 'down',
        state: 'active',
        statusText: 'Unreachable',
        error: 'Connection refused',
        elements: [],
      },
      {
        itemId: 'cache01',
        displayName: 'cache01.example.com',
        severity: 'ok',
        state: 'active',
        statusText: 'Operational',
        elements: [
          { type: 'gauge', key: 'cpu',  value: 12.4, unit: '%' },
          { type: 'gauge', key: 'mem',  value: 38.0, unit: '%' },
        ],
      },
      {
        itemId: 'staging',
        displayName: 'staging.example.com',
        severity: 'ok',
        state: 'paused',
        statusText: 'Paused',
        elements: [],
      },
    ],
  });
  // Log out so the topbar shows the viewer-facing lock icon, not the unlock/admin one.
  await page.request.post(`${BASE_URL}/api/logout`);
});

test('dark-mode dashboard screenshot for docs/README', async ({ page }) => {
  // Pin theme to dark before the first paint so applyPrefs runs with it.
  await page.addInitScript(() => {
    localStorage.setItem('simplestatus.prefs.v1', JSON.stringify({
      theme: 'dark', accent: 'mint', density: 'regular', cardstyle: 'paper',
      mark: 'stripe', mode: 'detailed', sparklines: true, summaryBar: true,
      refreshInterval: 30,
    }));
  });

  const stateResponse = page.waitForResponse(r => r.url().endsWith('/api/state'));
  await page.goto('/');
  await stateResponse;
  await pause(page, 600);

  await expect(page.locator('.grid .card')).toHaveCount(6);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(OUT_DIR, 'dashboard-dark.png'), fullPage: true });
});
