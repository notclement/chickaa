import { defineConfig, devices } from '@playwright/test';

const PORT = 8090;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against the PRODUCTION build (service workers only exist there).
 * Locally: `pnpm build && pnpm test:e2e`. Set CHROME_PATH to use an installed Chrome.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  // One worker: the update test temporarily rewrites dist/sw.js to simulate a deploy.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  projects: [
    { name: 'android-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node apps/api/dist/server.js',
    url: `${baseURL}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      PUBLIC_ORIGIN: baseURL,
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      RUN_MIGRATIONS_ON_START: process.env.DATABASE_URL ? 'true' : 'false',
      RATE_LIMIT_SCALE: '1000',
      ADMIN_SETUP_CODE: 'e2e-admin-code',
      FX_FAKE_RATES: 'THB>SGD=0.0375,IDR>SGD=0.0000845,JPY>SGD=0.0089',
    },
  },
});
