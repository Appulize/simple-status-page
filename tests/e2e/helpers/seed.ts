import { readFileSync, writeFileSync, mkdirSync, utimesSync } from 'node:fs';
import { resolve } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { DATA_ROOT, ADMIN_PASSWORD, BASE_URL, resetDataRoot } from './env';

const SETTINGS = resolve(DATA_ROOT, 'config', 'settings.json');
const CACHE = resolve(DATA_ROOT, 'cache', 'state.json');

export type Settings = Record<string, any>;

export function readSettings(): Settings {
  return JSON.parse(readFileSync(SETTINGS, 'utf8'));
}

export function writeSettings(s: Settings): void {
  mkdirSync(resolve(DATA_ROOT, 'config'), { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}

/**
 * Reset the data root, onboard the admin via the real API to write a valid
 * bcrypt hash, then return an authenticated APIRequestContext (cookie set).
 */
export async function onboard(request: APIRequestContext, password: string = ADMIN_PASSWORD): Promise<{ csrfToken: string }> {
  resetDataRoot();
  const res = await request.post(`${BASE_URL}/api/onboard`, { data: { password } });
  if (!res.ok()) throw new Error(`onboard failed: ${res.status()} ${await res.text()}`);
  const json = await res.json();
  return { csrfToken: json.csrfToken };
}

/**
 * Onboard, then mutate settings.json with the provided patcher and write the
 * cache file so the dashboard renders deterministic items without provider calls.
 */
export async function seedAuthedWithItems(
  request: APIRequestContext,
  opts: {
    instance?: Partial<Instance>;
    items: NormalizedItem[];
    settingsPatch?: (s: Settings) => void;
  },
): Promise<{ csrfToken: string }> {
  const { csrfToken } = await onboard(request);

  const settings = readSettings();
  const instance: Instance = {
    id: opts.instance?.id || 'inst-test',
    provider: opts.instance?.provider || 'uptimerobot',
    providerVersion: 1,
    name: opts.instance?.name || 'Test Instance',
    config: opts.instance?.config || { api_key: 'invalid-test-key' },
    items: opts.items.map(it => ({ id: it.itemId, visible: true, displayName: it.displayName ?? null })),
  };
  settings.instances = [instance];
  settings.displayOrder = opts.items.map(it => ({ instanceId: instance.id, itemId: it.itemId }));
  opts.settingsPatch?.(settings);
  writeSettings(settings);

  // Force settings.json mtime into the past so cache (cachedAt = now) stays "current".
  const past = Math.floor(Date.now() / 1000) - 60;
  utimesSync(SETTINGS, past, past);

  writeCache(opts.items, instance.id);

  return { csrfToken };
}

/**
 * Onboard, then immediately log out — leaves a password set but no active
 * session. Used to test the login/logout flow against a known password.
 */
export async function seedPasswordOnly(request: APIRequestContext, password: string = ADMIN_PASSWORD): Promise<void> {
  await onboard(request, password);
  await request.post(`${BASE_URL}/api/logout`);
}

export function writeCache(items: NormalizedItem[], instanceId: string, opts: { staleSince?: number } = {}): void {
  mkdirSync(resolve(DATA_ROOT, 'cache'), { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  const cachedAt = opts.staleSince ?? now;
  const stamped = items.map(it => ({
    instanceId,
    providerId: 'uptimerobot',
    state: 'active',
    severity: 'ok',
    statusText: 'Operational',
    lastSeenAt: now,
    elements: [],
    error: null,
    ...it,
  }));
  const payload = {
    schemaVersion: 1,
    cachedAt,
    data: {
      items: stamped,
      meta: {
        generatedAt: cachedAt,
        freshness: 'fresh',
        staleSince: null,
        instanceErrors: {},
        etag: 'seed-' + cachedAt,
      },
    },
  };
  writeFileSync(CACHE, JSON.stringify(payload));
}

export interface NormalizedItem {
  itemId: string;
  displayName?: string;
  state?: 'active' | 'paused' | 'maintenance' | 'unknown';
  severity?: 'ok' | 'degraded' | 'down';
  statusText?: string;
  elements?: any[];
  error?: string | null;
}

export interface Instance {
  id: string;
  provider: string;
  providerVersion: number;
  name: string;
  config: Record<string, any>;
  items: Array<{ id: string; visible: boolean; displayName: string | null }>;
}
