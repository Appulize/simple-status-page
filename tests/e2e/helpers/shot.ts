import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const counters = new WeakMap<TestInfo, number>();

/**
 * Capture a numbered screenshot into test-results/<test-slug>/NN-label.png
 * and also attach it to the HTML report. Order matches the order of calls.
 */
export async function shot(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  const n = (counters.get(testInfo) ?? 0) + 1;
  counters.set(testInfo, n);
  const seq = String(n).padStart(2, '0');
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const dir = resolve(testInfo.project.outputDir, slug(testInfo.titlePath));
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${seq}-${safeLabel}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${seq}-${safeLabel}`, { path, contentType: 'image/png' });
}

function slug(titlePath: string[]): string {
  return titlePath
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
