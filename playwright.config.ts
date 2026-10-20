import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4100;
const WEB_PORT = 5174;

/**
 * Browser tests run against their own API (port 4100), database (nocap_e2e) and upload
 * folder, so they never touch the data you use with `npm run dev`.
 */
export default defineConfig({
  testDir: 'e2e/tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run start -w server',
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        API_PORT: String(API_PORT),
        MONGODB_URI: 'mongodb://localhost:27017/nocap_e2e',
        UPLOAD_DIR: '../.e2e-uploads',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm run dev -w client -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
