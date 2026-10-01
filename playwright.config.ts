import { defineConfig, devices, type ReporterDescription } from '@playwright/test';
import os from 'node:os';
import { config } from './src/config';

const httpCredentials =
  config.httpUser && config.httpPass ? { username: config.httpUser, password: config.httpPass } : undefined;

const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

const allureReporter: ReporterDescription = [
  'allure-playwright',
  {
    resultsDir: 'allure-results',
    detail: true,
    suiteTitle: true,
    environmentInfo: {
      target_url: config.baseURL,
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
    },
  },
];

const reporters: ReporterDescription[] = process.env.CI
  ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }], allureReporter]
  : [
      ['list'],
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ['json', { outputFile: 'test-results/results.json' }],
      allureReporter,
    ];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 4 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: reporters,
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
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Mobile runs the functional journeys + responsive checks, not the full crawl.
      name: 'mobile-chrome',
      testMatch: /functional\/.*\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
