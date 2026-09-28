import { expect, test, Locator, Page } from '@playwright/test';
import { log } from './reportLogger';

/**
 * TestNG-style soft assertions: every check runs, failures are collected, and
 * `assertAll()` throws one error listing all of them.
 *
 *   const soft = new SoftAssert(page);
 *   await soft.visible(footer.quickLinksHeading, 'Quick Links heading');
 *   soft.equals(year, 2026, 'copyright year');
 *   soft.assertAll();
 *
 * Every check is written to the Extent log (pass/fail) and, on the first failure, a screenshot
 * is attached. Use the `soft` fixture from src/fixtures.ts to get assertAll() called for you.
 */
export class SoftAssert {
  private readonly failures: string[] = [];
  private passes = 0;
  private screenshotTaken = false;
  private done = false;

  constructor(
    private readonly page?: Page,
    private readonly opts: { timeout?: number; screenshotOnFailure?: boolean } = {},
  ) {}

  get failureCount() {
    return this.failures.length;
  }
  get passCount() {
    return this.passes;
  }
  get hasFailures() {
    return this.failures.length > 0;
  }

  /** Runs any assertion (sync or async); a thrown error is recorded instead of stopping the test. */
  async check(message: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
    try {
      await fn();
      this.passes++;
      log.pass(message);
      return true;
    } catch (e) {
      const reason = firstLine(e);
      this.failures.push(`${message}${reason ? ` — ${reason}` : ''}`);
      log.fail(`${message}${reason ? ` — ${reason}` : ''}`);
      if (this.page && this.opts.screenshotOnFailure !== false && !this.screenshotTaken) {
        this.screenshotTaken = true;
        await log.screenshot(this.page, `soft-assert failure: ${message}`.slice(0, 80));
      }
      return false;
    }
  }

  private get timeout() {
    return this.opts.timeout ?? 5_000;
  }

  // ---------- value assertions ----------
  equals<T>(actual: T, expected: T, message: string) {
    return this.check(message, () => expect(actual as unknown).toEqual(expected));
  }
  notEquals<T>(actual: T, unexpected: T, message: string) {
    return this.check(message, () => expect(actual as unknown).not.toEqual(unexpected));
  }
  isTrue(condition: unknown, message: string) {
    return this.check(message, () => expect(condition).toBeTruthy());
  }
  isFalse(condition: unknown, message: string) {
    return this.check(message, () => expect(condition).toBeFalsy());
  }
  contains(haystack: string | readonly unknown[], needle: unknown, message: string) {
    return this.check(message, () => expect(haystack).toContain(needle as never));
  }
  matches(actual: string | null | undefined, pattern: RegExp, message: string) {
    return this.check(message, () => expect(actual ?? '').toMatch(pattern));
  }
  greaterThan(actual: number, min: number, message: string) {
    return this.check(message, () => expect(actual).toBeGreaterThan(min));
  }
  lessThan(actual: number, max: number, message: string) {
    return this.check(message, () => expect(actual).toBeLessThan(max));
  }
  /** Passes when the list is empty; on failure the message lists the offending items. */
  isEmpty(list: readonly unknown[], message: string) {
    return this.check(message, () => {
      if (!list.length) return;
      const shown = list.slice(0, 15).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
      throw new Error(`${list.length} found: ${shown.join('; ')}${list.length > 15 ? '; …' : ''}`);
    });
  }

  // ---------- locator assertions (auto-waiting, short timeout) ----------
  visible(locator: Locator, message: string) {
    return this.check(message, () => expect(locator).toBeVisible({ timeout: this.timeout }));
  }
  hidden(locator: Locator, message: string) {
    return this.check(message, () => expect(locator).toBeHidden({ timeout: this.timeout }));
  }
  count(locator: Locator, expected: number, message: string) {
    return this.check(message, () => expect(locator).toHaveCount(expected, { timeout: this.timeout }));
  }
  async countAtLeast(locator: Locator, min: number, message: string) {
    return this.check(message, () => expect.poll(() => locator.count(), { timeout: this.timeout }).toBeGreaterThanOrEqual(min));
  }
  text(locator: Locator, expected: string | RegExp, message: string) {
    return this.check(message, () => expect(locator).toHaveText(expected, { timeout: this.timeout }));
  }
  containsText(locator: Locator, expected: string | RegExp, message: string) {
    return this.check(message, () => expect(locator).toContainText(expected, { timeout: this.timeout }));
  }
  attribute(locator: Locator, name: string, value: string | RegExp, message: string) {
    return this.check(message, () => expect(locator).toHaveAttribute(name, value, { timeout: this.timeout }));
  }
  url(page: Page, expected: string | RegExp, message: string) {
    return this.check(message, () => expect(page).toHaveURL(expected, { timeout: this.timeout }));
  }

  /** Fails the test with every collected failure. Safe to call more than once. */
  assertAll(title = 'Soft assertion failures') {
    if (this.done) return;
    this.done = true;
    if (!this.failures.length) return;
    const lines = this.failures.map((f, i) => `  ${i + 1}. ${f}`).join('\n');
    throw new Error(`${title} (${this.failures.length} failed, ${this.passes} passed):\n${lines}`);
  }
}

function firstLine(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Playwright messages contain ANSI colours and a long call log — keep the useful part.
  return msg
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^Call log:/.test(l))
    .slice(0, 5)
    .join(' | ')
    .slice(0, 300);
}

/** Wraps a block in a test step and asserts all soft checks made inside it at the end. */
export async function softly(page: Page | undefined, title: string, body: (soft: SoftAssert) => Promise<void>) {
  await test.step(title, async () => {
    const soft = new SoftAssert(page);
    await body(soft);
    soft.assertAll(title);
  });
}
