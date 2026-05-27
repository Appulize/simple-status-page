import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '.env') });

import { BASE_URL, DATA_ROOT, PORT, REPO_ROOT } from './helpers/env';

export default defineConfig({
  testDir: './specs',
  outputDir: resolve(REPO_ROOT, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(REPO_ROOT, 'playwright-report'), open: 'never' }],
  ],
  globalSetup: resolve(__dirname, 'global-setup.ts'),
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `php -S 127.0.0.1:${PORT} -t public public/router.php`,
    cwd: REPO_ROOT,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30_000,
    env: {
      SSP_DATA_ROOT: DATA_ROOT,
    },
  },
});
