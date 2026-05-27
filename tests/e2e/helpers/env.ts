import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const REPO_ROOT = resolve(__dirname, '..', '..', '..');
export const DATA_ROOT = resolve(REPO_ROOT, 'tests', 'e2e', '.tmp', 'data');
export const PORT = Number(process.env.E2E_PORT || 8123);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'correct-horse-battery-staple';

export function resetDataRoot(): void {
  if (existsSync(DATA_ROOT)) {
    rmSync(DATA_ROOT, { recursive: true, force: true });
  }
  mkdirSync(resolve(DATA_ROOT, 'config'), { recursive: true });
  mkdirSync(resolve(DATA_ROOT, 'cache', 'sessions'), { recursive: true, mode: 0o700 });
  mkdirSync(resolve(DATA_ROOT, 'cache', 'throttle'), { recursive: true, mode: 0o700 });
}
