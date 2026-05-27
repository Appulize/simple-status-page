import { test, expect } from '@playwright/test';
import { seedAuthedWithItems } from '../helpers/seed';
import { shot } from '../helpers/shot';
import { openSettings, switchTab, pause } from '../helpers/ui';

test.beforeEach(async ({ page }) => {
  await seedAuthedWithItems(page.request, {
    items: [
      { itemId: 'srv-a', displayName: 'alpha',   severity: 'ok', state: 'active' },
      { itemId: 'srv-b', displayName: 'bravo',   severity: 'ok', state: 'active' },
      { itemId: 'srv-c', displayName: 'charlie', severity: 'ok', state: 'active' },
    ],
  });
});

test('display order: dragging charlie above alpha persists', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForResponse(r => r.url().endsWith('/api/state'));
  await pause(page, 400);

  await expect(page.locator('.card .card-title-inner h3').nth(0)).toHaveText('alpha');

  const drawer = await openSettings(page);
  await switchTab(page, 'order');
  await shot(page, testInfo, 'order-tab-before');

  // Wait for the order tab content to actually render.
  await expect(drawer.locator('.drag-row')).toHaveCount(3);

  // Playwright's dragTo() is unreliable for HTML5 drag-and-drop; dispatch the
  // events explicitly with a shared DataTransfer to drive the app's handlers.
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/settings') && r.request().method() === 'POST' && r.status() === 200),
    page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.drag-row'));
      const src = rows.find(r => (r.textContent || '').includes('charlie'));
      const dst = rows.find(r => (r.textContent || '').includes('alpha'));
      if (!src || !dst) throw new Error(`drag rows missing: charlie=${!!src} alpha=${!!dst}; have=${rows.length}; text=[${rows.map(r => JSON.stringify(r.textContent)).join(',')}]`);
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt }));
      src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, cancelable: true, dataTransfer: dt }));
    }),
  ]);

  await expect(page.locator('.card .card-title-inner h3')).toHaveText(['charlie', 'alpha', 'bravo']);
  await pause(page, 400);
  await shot(page, testInfo, 'order-tab-after');
});
