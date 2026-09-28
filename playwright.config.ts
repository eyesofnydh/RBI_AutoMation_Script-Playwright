import { defineConfig, devices } from '@playwright/test';
import { config } from './src/config';

const httpCredentials =
  config.httpUser && config.httpPass ? { username: config.httpUser, password: config.httpPass } : undefined;

// Workers re-read this file without the CLI args, so remember --headed in the environment.
if (process.argv.includes('--headed')) process.env.PW_HEADED = '1';

/**
 * Maximised window: `viewport: null` lets the page use the real window size, and
 * --start-maximized fills the screen when headed. Headless has no screen, so it gets
 * an explicit --window-size (WINDOW_SIZE, default 1920,1080).
 */
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
const maximizeArgs = config.maximize ? ['--start-maximized', `--window-size=${config.windowSize.join(',')}`] : [];

// Device descriptors fix the viewport and deviceScaleFactor, which Playwright rejects with viewport: null.
const { viewport: _vp, deviceScaleFactor: _dsf, ...desktopChrome } = devices['Desktop Chrome'];
const desktopUse = config.maximize
  ? { ...desktopChrome, viewport: null, launchOptions: { ...launchOptions, args: maximizeArgs } }
  : { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['./src/reporters/extent-reporter.ts', { outputFolder: config.reportDir, documentTitle: config.reportTitle }],
  ],
  use: {
    baseURL: config.baseURL,
    httpCredentials,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
    launchOptions,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: desktopUse,
    },
    {
      // Mobile runs the functional journeys + responsive checks, not the full crawl.
      name: 'mobile-chrome',
      testMatch: /functional\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
