import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { SiteHeader } from '../../src/pages/SiteHeader';
import { config } from '../../src/config';
import { X, xp, xpVisible } from '../../src/locators/xpath';

test.describe('Site search', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/');
  });

  test(`searching "${config.searchTerm}" from the header shows results`, async ({ page, issues }) => {
    await new SiteHeader(page).search(config.searchTerm);
    await expect(page).toHaveURL(/\/search\?.*q=/);
    await expect(xp(page, X.search.title)).toContainText(config.searchTerm);
    const results = xp(page, X.search.resultLinks);
    await expect(results.first()).toBeVisible();
    expect(await results.count()).toBeGreaterThan(0);
    const firstWord = config.searchTerm.split(/\s+/)[0];
    await expect(results.first(), 'top result relevant to the term').toContainText(new RegExp(firstWord, 'i'));
    expect(issues.pageErrors).toEqual([]);
  });

  test('result count is shown and is a number', async ({ page }) => {
    await gotoAndSettle(page, `/search?q=${encodeURIComponent(config.searchTerm)}`);
    const txt = await xp(page, X.search.resultCount).first().textContent();
    const n = Number((txt || '').replace(/[^\d]/g, ''));
    expect(n).toBeGreaterThan(0);
  });

  test('clicking a search result opens a working page', async ({ page }) => {
    await gotoAndSettle(page, `/search?q=${encodeURIComponent(config.searchTerm)}`);
    const result = xp(page, X.search.resultLinks).first();
    const href = (await result.getAttribute('href'))!;
    await result.click();
    await page.waitForLoadState('domcontentloaded');
    expect(new URL(page.url()).pathname).toBe(new URL(href, page.url()).pathname);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('search results paginate', async ({ page }) => {
    await gotoAndSettle(page, `/search?q=${encodeURIComponent(config.searchTerm)}`);
    const first = await xp(page, X.search.resultLinks).first().getAttribute('href');
    await xpVisible(page, X.listing.pagerPage(2)).click();
    await expect.poll(() => xp(page, X.search.resultLinks).first().getAttribute('href')).not.toBe(first);
  });

  test('gibberish search shows the empty state', async ({ page, issues }) => {
    await new SiteHeader(page).search('zqxwvkjhg123nonexistent');
    await expect(xp(page, X.search.noResults)).toBeVisible();
    await expect(xp(page, X.search.resultLinks)).toHaveCount(0);
    expect(issues.pageErrors).toEqual([]);
  });

  test('special characters are handled safely (no XSS, no 5xx)', async ({ page, issues }) => {
    let dialogFired = false;
    page.on('dialog', async (d) => {
      dialogFired = true;
      await d.dismiss();
    });
    await new SiteHeader(page).search(`<script>alert(1)</script> ' " % &`);
    await page.waitForTimeout(1000);
    expect(dialogFired, 'no script executed from search input').toBe(false);
    const res = await page.request.get(page.url(), { failOnStatusCode: false });
    expect(res.status()).toBeLessThan(500);
    expect(issues.pageErrors).toEqual([]);
  });

  test('very long query is limited to 250 characters', async ({ page }) => {
    const box = new SiteHeader(page).searchBox;
    test.skip(!(await box.isVisible()), 'header search hidden on this viewport');
    await box.fill('a'.repeat(400));
    expect((await box.inputValue()).length).toBeLessThanOrEqual(250);
  });

  test('empty search does not break the page', async ({ page, issues }) => {
    await new SiteHeader(page).search('');
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toBeVisible();
    expect(issues.pageErrors).toEqual([]);
  });

  test('"Clear all" removes the query', async ({ page }) => {
    await gotoAndSettle(page, '/search?q=zqxwvkjhg123nonexistent');
    await xpVisible(page, X.search.clearAll).click();
    await expect(xp(page, X.search.noResults)).toBeHidden();
  });
});
