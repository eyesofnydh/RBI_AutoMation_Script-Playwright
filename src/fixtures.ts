import { test as base, expect, Page } from '@playwright/test';
import { config, consoleAllowlist } from './config';

export type PageIssues = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/**
 * `issues` collects console errors, uncaught JS exceptions and failed same-origin
 * requests for the lifetime of the test's page.
 */
export const test = base.extend<{ issues: PageIssues }>({
  issues: async ({ page }, use, testInfo) => {
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

    const count = issues.consoleErrors.length + issues.pageErrors.length + issues.failedRequests.length;
    if (count > 0) {
      await testInfo.attach('browser-issues.json', {
        body: JSON.stringify(issues, null, 2),
        contentType: 'application/json',
      });
      testInfo.annotations.push({ type: 'browser-issues', description: `${count} issue(s) captured` });
    }
  },
});

export { expect };

/** Go to a path and wait until the page is reasonably settled. */
export async function gotoAndSettle(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
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
