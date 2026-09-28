import { test as base, expect, Page } from '@playwright/test';
import { config, consoleAllowlist } from './config';
import { SoftAssert } from './utils/softAssert';
import { log } from './utils/reportLogger';
import { SiteFooter } from './pages/SiteFooter';

export type PageIssues = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/**
 * `issues` collects console errors, uncaught JS exceptions and failed same-origin
 * requests for the lifetime of the test's page.
 *
 * `soft` is a SoftAssert whose assertAll() runs automatically when the test ends, so every
 * soft failure is reported together and fails the test (call soft.assertAll() yourself to
 * fail earlier).
 *
 * `footer` is the SiteFooter page object.
 */
export const test = base.extend<{ issues: PageIssues; soft: SoftAssert; footer: SiteFooter }>({
  soft: async ({ page }, use) => {
    const soft = new SoftAssert(page);
    await use(soft);
    soft.assertAll();
  },

  footer: async ({ page }, use) => {
    await use(new SiteFooter(page));
  },

  issues: async ({ page }, use) => {
    const issues: PageIssues = { consoleErrors: [], pageErrors: [], failedRequests: [] };
    const origin = new URL(config.baseURL).origin;

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const src = msg.location()?.url ?? '';
      if (consoleAllowlist.some((re) => re.test(text) || re.test(src))) return;
      const detail = /Failed to load resource/.test(text) && src ? `${text} — ${src}` : text;
      issues.consoleErrors.push(detail.slice(0, 300));
    });
    page.on('pageerror', (err) => issues.pageErrors.push(`${err.name}: ${err.message}`.slice(0, 300)));
    page.on('requestfailed', (req) => {
      if (!req.url().startsWith(origin)) return;
      const reason = req.failure()?.errorText ?? '';
      if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)) return; // navigations/cancelled prefetches
      issues.failedRequests.push(`${req.method()} ${req.url()} — ${reason}`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (consoleAllowlist.some((re) => re.test(url))) return;
      if (url.startsWith(origin) && res.status() >= 400 && res.request().resourceType() !== 'document') {
        issues.failedRequests.push(`${res.status()} ${url}`);
      }
    });

    await use(issues);
  },
});

export { expect };

/** Go to a path and wait until the page is reasonably settled. */
export async function gotoAndSettle(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  log.info(`Opened ${new URL(page.url()).pathname} (HTTP ${res?.status() ?? '-'}) on ${config.baseURL}`);
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  return res;
}

/** Scroll to the bottom in steps so lazy-loaded images/sections render. */
export async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, 0);
  });
}
