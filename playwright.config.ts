import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 15_000 }, fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, retries: 0,
  outputDir: 'output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  use: { baseURL: process.env.TRUSTED_ORIGIN ?? 'http://127.0.0.1:3005', channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), screenshot: 'only-on-failure', trace: 'off' },
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
});
