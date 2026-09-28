import { test, Page } from '@playwright/test';

/**
 * Step-level log for the Extent report (src/reporters/extent-reporter.ts), in the style of
 * ExtentTest.log(Status, details):
 *
 *   log.info('Opened footer');  log.pass('Quick Links present');  log.fail('Forms → 404');
 *
 * Entries are stored as test annotations `extent:<status>`, so they also show up in the
 * Playwright HTML report. Logging never fails a test — use SoftAssert / expect for that.
 */
export type LogStatus = 'info' | 'pass' | 'warning' | 'fail' | 'skip';
export const EXTENT_PREFIX = 'extent:';

function write(status: LogStatus, message: string) {
  let info;
  try {
    info = test.info();
  } catch {
    return; // called outside a test (e.g. from the crawler) — nothing to log to
  }
  const at = new Date().toISOString();
  info.annotations.push({ type: `${EXTENT_PREFIX}${status}`, description: `${at} ${message}` });
}

export const log = {
  info: (message: string) => write('info', message),
  pass: (message: string) => write('pass', message),
  warning: (message: string) => write('warning', message),
  fail: (message: string) => write('fail', message),
  skip: (message: string) => write('skip', message),

  /** Attaches a screenshot of the page (full page by default) to the current test. */
  async screenshot(page: Page, name = 'screenshot', fullPage = false) {
    const body = await page.screenshot({ fullPage }).catch(() => undefined);
    if (body) await test.info().attach(name, { body, contentType: 'image/png' });
  },

  /** Attaches any JSON-serialisable data (link lists, audit results, …). */
  async data(name: string, value: unknown) {
    await test.info().attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
  },
};

/** Splits an `extent:*` annotation back into {status, time, message}. */
export function parseLogAnnotation(a: { type: string; description?: string }) {
  if (!a.type.startsWith(EXTENT_PREFIX)) return undefined;
  const status = a.type.slice(EXTENT_PREFIX.length) as LogStatus;
  const d = a.description ?? '';
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) ([\s\S]*)$/.exec(d);
  return { status, time: m ? new Date(m[1]) : undefined, message: m ? m[2] : d };
}
