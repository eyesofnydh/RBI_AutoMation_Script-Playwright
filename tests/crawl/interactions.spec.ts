import type { Page } from '@playwright/test';
import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { pagePaths } from '../../src/data';
import { config } from '../../src/config';

/**
 * AUTO-CLICK TESTER
 * For every crawled page: finds every visible interactive control inside <main> and the footer
 * (buttons, tabs, accordions, dropdowns/listboxes, toggles, carousel arrows/dots, <summary>)
 * and clicks each one, then checks:
 *   ✗ FAIL  uncaught JavaScript error after the click
 *   ✗ FAIL  click navigates to a page that returns 4xx/5xx
 *   ✗ FAIL  control is visible but cannot be clicked (covered by another element / disabled look-alike)
 *   ⚠ WARN  click changed nothing (no state change, no content change, no navigation) — possible dead button
 * Then fills every visible text/search input with edge-case data (empty, very long, special chars,
 * script tag, SQL-like text, unicode) and presses Enter, checking for JS errors, 5xx, and script execution.
 *
 * Run after `npm run crawl`:   npx playwright test interactions --project=desktop-chrome
 * Limit with INTERACTION_PAGE_LIMIT / MAX_CLICKS_PER_PAGE in .env.
 */
test.describe.configure({ mode: 'parallel' });

const CANDIDATES = [
  'main button',
  'main [role="tab"]',
  'main [role="button"]',
  'main [role="combobox"]',
  'main [aria-expanded]',
  'main [aria-haspopup]',
  'main summary',
  'main [role="switch"]',
  'main input[type="checkbox"]',
  'main input[type="radio"]',
  'footer button',
].join(', ');

/** Never click these (destructive or leaves the flow). */
const DENY = /log ?out|sign ?out|delete|remove account|pay now|unsubscribe/i;

const EDGE_INPUTS: { name: string; value: string }[] = [
  { name: 'empty', value: '' },
  { name: 'whitespace', value: '     ' },
  { name: 'very long (500 chars)', value: 'a'.repeat(500) },
  { name: 'special chars', value: `~!@#$%^&*()_+{}|:"<>?[];',./\`` },
  { name: 'script tag (XSS)', value: '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">' },
  { name: 'SQL-like', value: `' OR '1'='1'; DROP TABLE users; --` },
  { name: 'unicode / Hindi / emoji', value: 'भारतीय रिज़र्व बैंक ₹ 😀' },
  { name: 'numbers only', value: '1234567890' },
];

type Finding = { control: string; problem: string };

async function tagControls(page: Page): Promise<number> {
  return page.evaluate(
    ({ sel, deny }) => {
      const denyRe = new RegExp(deny, 'i');
      document.querySelectorAll('[data-e2e-idx]').forEach((e) => e.removeAttribute('data-e2e-idx'));
      const seen = new Set<Element>();
      let i = 0;
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (!visible || (el as HTMLButtonElement).disabled || denyRe.test(label)) continue;
        el.setAttribute('data-e2e-idx', String(i++));
      }
      return i;
    },
    { sel: CANDIDATES, deny: DENY.source },
  );
}

async function describe(page: Page, idx: number): Promise<string> {
  return page
    .locator(`[data-e2e-idx="${idx}"]`)
    .evaluate((el) => {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '';
      return `${el.tagName.toLowerCase()}${id}${cls} "${label}"`;
    })
    .catch(() => `element #${idx}`);
}

/** Everything a click could reasonably change. */
async function snapshot(page: Page, idx: number) {
  return page.evaluate((i) => {
    const el = document.querySelector(`[data-e2e-idx="${i}"]`);
    const main = document.querySelector('main') || document.body;
    const visibleCount = Array.from(main.querySelectorAll('*')).filter((e) => (e as HTMLElement).offsetParent !== null).length;
    return JSON.stringify({
      url: location.href,
      el: el
        ? [el.getAttribute('aria-expanded'), el.getAttribute('aria-selected'), el.getAttribute('aria-pressed'), el.getAttribute('aria-checked'), (el as HTMLInputElement).checked, el.className]
        : null,
      visibleCount,
      text: (main as HTMLElement).innerText.length,
      scroll: Math.round(window.scrollY / 50),
      dialogs: document.querySelectorAll('[role="dialog"]:not([hidden]), [aria-modal="true"]').length,
      bodyClass: document.body.className,
    });
  }, idx);
}

for (const path of pagePaths(config.interactionPageLimit)) {
  test(`click everything on ${path}`, { tag: '@interactions' }, async ({ page, issues, context }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const res = await gotoAndSettle(page, path);
    test.skip(!res || res.status() >= 400, `page itself returns ${res?.status()}`);

    const failures: Finding[] = [];
    const warnings: Finding[] = [];
    const clicked: string[] = [];
    let total = await tagControls(page);
    const limit = Math.min(total, config.maxClicksPerPage);

    for (let i = 0; i < limit; i++) {
      // Re-tag if the DOM was rebuilt (e.g. after returning from a navigation)
      if ((await page.locator(`[data-e2e-idx="${i}"]`).count()) === 0) {
        total = await tagControls(page);
        if (i >= total) break;
      }
      const target = page.locator(`[data-e2e-idx="${i}"]`);
      if (!(await target.isVisible().catch(() => false))) continue; // hidden by a previous click (e.g. panel closed)

      const name = await describe(page, i);
      const errorsBefore = issues.pageErrors.length;
      const before = await snapshot(page, i);
      const popupPromise = context.waitForEvent('page', { timeout: 1500 }).catch(() => null);

      try {
        await target.scrollIntoViewIfNeeded({ timeout: 2000 });
        await target.click({ timeout: 4000 });
      } catch (e) {
        const msg = String(e);
        if (/intercepts pointer events/.test(msg)) failures.push({ control: name, problem: 'cannot be clicked — covered by another element' });
        else if (/not stable|detached|not visible|Timeout/.test(msg)) warnings.push({ control: name, problem: 'could not click (moving/hidden/timeout)' });
        else failures.push({ control: name, problem: msg.split('\n')[0].slice(0, 150) });
        continue;
      }
      clicked.push(name);
      await page.waitForTimeout(400);

      // New tab opened?
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        const status = await page.request.get(popup.url(), { failOnStatusCode: false }).then((r) => r.status()).catch(() => 0);
        if (status >= 400) failures.push({ control: name, problem: `opens new tab ${popup.url()} → HTTP ${status}` });
        await popup.close();
      }

      // JS error?
      if (issues.pageErrors.length > errorsBefore) {
        failures.push({ control: name, problem: `JavaScript error: ${issues.pageErrors.slice(errorsBefore).join(' | ')}` });
      }

      // Navigated away?
      const nowUrl = page.url();
      const startUrl = new URL(path, config.baseURL).href;
      if (new URL(nowUrl).pathname !== new URL(startUrl).pathname) {
        const status = await page.request.get(nowUrl, { failOnStatusCode: false }).then((r) => r.status()).catch(() => 0);
        if (status >= 400) failures.push({ control: name, problem: `navigates to ${new URL(nowUrl).pathname} → HTTP ${status}` });
        await gotoAndSettle(page, path);
        await tagControls(page);
        continue;
      }

      // Nothing happened?
      const after = await snapshot(page, i).catch(() => 'gone');
      if (!popup && after === before) warnings.push({ control: name, problem: 'click had no visible effect' });

      // Close whatever opened, so the next control is reachable
      await page.keyboard.press('Escape').catch(() => {});
    }

    // ---------- Inputs: edge-case data ----------
    await gotoAndSettle(page, path);
    const inputs = page.locator('main input[type="search"]:visible, main input[type="text"]:visible, main input:not([type]):visible, main textarea:visible');
    const inputCount = Math.min(await inputs.count(), 5);
    for (let k = 0; k < inputCount; k++) {
      const input = inputs.nth(k);
      const inputName = (await input.getAttribute('id')) || (await input.getAttribute('aria-label')) || `input ${k}`;
      for (const edge of EDGE_INPUTS) {
        if (!(await input.isVisible().catch(() => false))) {
          await gotoAndSettle(page, path);
        }
        const errorsBefore = issues.pageErrors.length;
        let dialog = false;
        const onDialog = async (d: import('@playwright/test').Dialog) => {
          dialog = true;
          await d.dismiss();
        };
        page.once('dialog', onDialog);
        await page.evaluate(() => ((window as any).__xss = 0)).catch(() => {});
        try {
          await inputs.nth(k).fill(edge.value, { timeout: 3000 });
          await inputs.nth(k).press('Enter', { timeout: 3000 });
          await page.waitForTimeout(700);
        } catch {
          continue;
        }
        const xss = await page.evaluate(() => (window as any).__xss === 1).catch(() => false);
        if (dialog || xss) failures.push({ control: `input ${inputName}`, problem: `SCRIPT EXECUTED with "${edge.name}" input (XSS)` });
        if (issues.pageErrors.length > errorsBefore) failures.push({ control: `input ${inputName}`, problem: `JavaScript error with "${edge.name}": ${issues.pageErrors.slice(errorsBefore).join(' | ')}` });
        const status = await page.request.get(page.url(), { failOnStatusCode: false }).then((r) => r.status()).catch(() => 0);
        if (status >= 500) failures.push({ control: `input ${inputName}`, problem: `server error ${status} with "${edge.name}"` });
        const maxLen = await inputs.nth(k).getAttribute('maxlength').catch(() => null);
        if (edge.name.startsWith('very long') && !maxLen) warnings.push({ control: `input ${inputName}`, problem: 'no maxlength — accepts unlimited text' });
        page.off('dialog', onDialog);
        if (new URL(page.url()).pathname !== new URL(path, config.baseURL).pathname) await gotoAndSettle(page, path);
      }
    }

    // ---------- Report ----------
    await testInfo.attach('interaction-results.json', {
      body: JSON.stringify({ page: path, controlsFound: total, clicked: clicked.length, failures, warnings, clickedControls: clicked }, null, 2),
      contentType: 'application/json',
    });
    testInfo.annotations.push({ type: 'controls', description: `${total} found, ${clicked.length} clicked, ${inputCount} inputs tested` });
    warnings.forEach((w) => testInfo.annotations.push({ type: 'warning', description: `${w.control}: ${w.problem}` }));

    expect.soft(failures.map((f) => `${f.control} → ${f.problem}`), `broken controls on ${path}`).toEqual([]);
  });
}
