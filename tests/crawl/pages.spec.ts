import { test, expect, gotoAndSettle, autoScroll } from '../../src/fixtures';
import { pagePaths } from '../../src/data';

/**
 * One test per crawled page (run `npm run crawl` first; otherwise the seed list is used).
 * Hard failures: HTTP error, uncaught JS exception, missing <title>.
 * Soft failures (all reported together): console errors, failed sub-requests, broken images,
 * heading structure, template leaks like "undefined"/"lorem ipsum", horizontal overflow, SEO basics.
 */
test.describe.configure({ mode: 'parallel' });

const paths = pagePaths();

for (const path of paths) {
  test(`page ${path}`, { tag: '@pages' }, async ({ page, issues }) => {
    const t0 = Date.now();
    const res = await gotoAndSettle(page, path);
    const loadMs = Date.now() - t0;
    test.info().annotations.push({ type: 'load-ms', description: String(loadMs) });

    expect(res, 'navigation returned a response').not.toBeNull();
    expect(res!.status(), `HTTP status for ${path}`).toBeLessThan(400);

    await expect(page, 'page has a <title>').toHaveTitle(/\S/);
    await autoScroll(page);

    const audit = await page.evaluate(() => {
      const visibleText = document.body.innerText || '';
      const brokenImages = [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src'))
        .map((img) => img.currentSrc || img.src);
      const imagesWithoutAlt = [...document.images].filter((img) => !img.hasAttribute('alt')).map((img) => img.src).slice(0, 10);
      const leaks = (visibleText.match(/\b(undefined|NaN|\[object Object\]|lorem ipsum|null null)\b/gi) || []).slice(0, 5);
      const emptyLinks = [...document.querySelectorAll('a')]
        .filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#')
        .filter((a) => !a.getAttribute('role'))
        .map((a) => (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 60))
        .slice(0, 10);
      return {
        h1s: [...document.querySelectorAll('h1')].filter((h) => (h as HTMLElement).offsetParent !== null).length,
        lang: document.documentElement.lang,
        metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        hasHeader: !!document.querySelector('header'),
        hasFooter: !!document.querySelector('footer'),
        hasMain: !!document.querySelector('main'),
        textLength: visibleText.trim().length,
        brokenImages,
        imagesWithoutAlt,
        leaks,
        emptyLinks,
      };
    });

    // Hard
    expect(issues.pageErrors, 'uncaught JavaScript exceptions').toEqual([]);

    // Soft — every problem on the page gets reported in one go
    expect.soft(issues.consoleErrors, 'console errors').toEqual([]);
    expect.soft([...new Set(issues.failedRequests)], 'failed same-origin requests (4xx/5xx/network)').toEqual([]);
    expect.soft(audit.brokenImages, 'broken images').toEqual([]);
    expect.soft(audit.imagesWithoutAlt, 'images missing alt attribute').toEqual([]);
    expect.soft(audit.h1s, 'exactly one visible <h1>').toBe(1);
    expect.soft(audit.hasHeader, 'has <header>').toBe(true);
    expect.soft(audit.hasFooter, 'has <footer>').toBe(true);
    expect.soft(audit.hasMain, 'has <main>').toBe(true);
    expect.soft(audit.textLength, 'page has real content').toBeGreaterThan(200);
    expect.soft(audit.leaks, 'template leaks in visible text').toEqual([]);
    expect.soft(audit.emptyLinks, 'links without a real href').toEqual([]);
    expect.soft(audit.overflowPx, 'no horizontal scroll').toBeLessThanOrEqual(1);
    expect.soft(audit.lang, '<html lang> set').toMatch(/^(en|hi)/);
    expect.soft(audit.metaDescription.length, 'meta description present').toBeGreaterThan(0);
    expect.soft(loadMs, 'page settles within 15s').toBeLessThan(15_000);
  });
}
