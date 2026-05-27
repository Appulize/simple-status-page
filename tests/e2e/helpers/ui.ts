import type { Page, Locator } from '@playwright/test';

/** Small fixed wait — used after open/close transitions so screenshots aren't mid-fade. */
export function pause(page: Page, ms: number = 300): Promise<void> {
  return page.waitForTimeout(ms);
}

export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const drawer = page.getByRole('dialog', { name: 'Settings' });
  await drawer.waitFor({ state: 'visible' });
  await pause(page);
  return drawer;
}

export async function closeSettings(page: Page): Promise<void> {
  const drawer = page.getByRole('dialog', { name: 'Settings' });
  await drawer.getByRole('button', { name: 'Close' }).click();
  await drawer.waitFor({ state: 'hidden' });
  await pause(page);
}

export async function switchTab(page: Page, tab: 'appearance' | 'catalog' | 'order' | 'auth'): Promise<void> {
  const label = tab === 'order' ? 'Display order' : tab;
  await page.locator('.drawer-tab', { hasText: new RegExp(`^${label}$`, 'i') }).click();
  await pause(page);
}

export async function openLogin(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Sign in' }).click();
  const modal = page.getByRole('dialog', { name: 'Sign in' });
  await modal.waitFor({ state: 'visible' });
  await pause(page);
  return modal;
}

export async function loginThroughUI(page: Page, password: string): Promise<void> {
  const modal = await openLogin(page);
  await modal.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/login') && r.request().method() === 'POST'),
    modal.getByRole('button', { name: /continue/i }).click(),
  ]);
  await modal.waitFor({ state: 'hidden' });
  await pause(page);
}
