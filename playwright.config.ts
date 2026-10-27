import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// A system-wide Chrome install may live outside Playwright's per-user channel path.
// Keep explicit channel choices and non-Windows bundled Chromium behavior unchanged.
const systemChrome = process.platform === 'win32' && !process.env.PLAYWRIGHT_CHANNEL
  ? [process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'), process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'), process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe')].find((path): path is string => !!path && existsSync(path))
  : undefined;

export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 15_000 }, fullyParallel: false, workers: 1,
  forbidOnly: !!process.env.CI, retries: 0,
  outputDir: 'output/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  // Delivery may be revealed during a failed assertion. Capture only explicit safe views.
  use: { baseURL: process.env.TRUSTED_ORIGIN ?? 'http://127.0.0.1:3005', channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'chrome' : undefined), ...(systemChrome ? { launchOptions: { executablePath: systemChrome } } : {}), screenshot: 'off', trace: 'off' },
  projects: [{ name: 'desktop-chromium', testIgnore: ['responsive.spec.ts', 'm2-regressions.spec.ts'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'mobile-chromium', testIgnore: ['responsive.spec.ts', 'm2-regressions.spec.ts'], use: { ...devices['Pixel 7'] } }, { name: 'responsive-chromium', testMatch: ['responsive.spec.ts', 'm2-regressions.spec.ts'], use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } }],
});
