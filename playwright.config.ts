import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const preinstalled = '/opt/pw-browsers/chromium';

// The e2e build uses a test auth adapter (mode "e2e"); Graph is mocked with page.route.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/bluehealer-ops/',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined) },
  },
  webServer: {
    command: 'npm run preview:e2e',
    url: 'http://localhost:4173/bluehealer-ops/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
