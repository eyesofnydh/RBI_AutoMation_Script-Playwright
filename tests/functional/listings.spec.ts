import { test, expect, gotoAndSettle } from '../../src/fixtures';
import type { Page } from '@playwright/test';
import { listingPaths } from '../../src/config';
import { X, xp, xpVisible } from '../../src/locators/xpath';

/** Item links on a listing: `a.card__title` where available, otherwise links one level deeper than the listing. */
function itemLinks(page: Page, listing: string) {
  const section = listing.split('/').filter(Boolean)[0];
  return xp(page, X.listing.cardTitleLinks)
    .or(page.locator(`main a[href^="/${section}/"]:not(nav a)`))
    .filter({ visible: true });
}

const hrefsOf = (page: Page, listing: string) =>
  itemLinks(page, listing).evaluateAll((els) => els.map((e) => e.getAttribute('href')).join('|'));

test.describe('Listing pages (generic)', { tag: '@functional' }, () => {
  for (const path of listingPaths) {
    test.describe(path, () => {
      test.beforeEach(async ({ page }) => {
        await gotoAndSettle(page, path);
      });

      test('has title, breadcrumb and items', async ({ page }) => {
        await expect(page.locator('h1').first()).toBeVisible();
        await expect.soft(xp(page, X.listing.breadcrumb)).toBeVisible();
        await expect.soft(xp(page, X.listing.breadcrumbHome)).toBeVisible();
        expect(await itemLinks(page, path).count(), 'item links on listing').toBeGreaterThan(0);
      });

      test('first item opens a detail page', async ({ page, issues }) => {
        const first = itemLinks(page, path).first();
        const title = (await first.innerText()).trim().split('\n')[0].slice(0, 25);
        await first.click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('h1').first()).toBeVisible();
        await expect.soft(page.locator('h1').first(), 'detail title matches listing').toContainText(title.slice(0, 15));
        expect(issues.pageErrors).toEqual([]);
      });

      test('pagination changes the items (if present)', async ({ page }) => {
        const pager = xp(page, X.listing.pager);
        test.skip(!(await pager.isVisible().catch(() => false)), 'no pagination here');
        const before = await hrefsOf(page, path);
        await xpVisible(page, X.listing.pagerPage(2)).click();
        await expect.poll(() => hrefsOf(page, path), { message: 'page 2 shows different items' }).not.toBe(before);
      });
    });
  }
});

test.describe('Press Releases — filters, sort, paging', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/press-releases');
  });

  test('shows 20 cards with date and title by default', async ({ page }) => {
    await expect(xp(page, X.listing.title)).toHaveText(/Press Releases/);
    await expect(xp(page, X.listing.cards)).toHaveCount(20);
    await expect(xp(page, X.listing.cards).first()).toContainText(/\w+ \d{1,2}, \d{4}/);
  });

  test('year filter narrows results to that year', async ({ page }) => {
    await xp(page, X.listing.yearSelect).click();
    const opts = xp(page, X.listing.yearOptions).filter({ visible: true });
    await expect(opts.first()).toBeVisible();
    // pick a past year (second option) so there are results
    const option = opts.nth(Math.min(1, (await opts.count()) - 1));
    const year = ((await option.innerText()).match(/\d{4}/) || [''])[0];
    await option.click();
    await page.waitForLoadState('networkidle').catch(() => {});
    const apply = page.getByRole('button', { name: /^(apply|show \d[\d,]* results?)/i }).filter({ visible: true }).first();
    if (await apply.isVisible().catch(() => false)) await apply.click();
    await expect(xp(page, X.listing.yearSelect)).toContainText(year);
    await expect.poll(async () => (await xp(page, X.listing.cards).first().innerText()).includes(year), { message: `first card is from ${year}` }).toBe(true);
  });

  test('month filter can be selected', async ({ page, issues }) => {
    await xp(page, X.listing.monthSelect).click();
    const opts = xp(page, X.listing.monthOptions).filter({ visible: true });
    await expect(opts.first()).toBeVisible();
    const name = (await opts.first().innerText()).trim();
    await opts.first().click();
    await expect(xp(page, X.listing.monthSelect)).toContainText(name);
    expect(issues.pageErrors).toEqual([]);
  });

  test('function checkbox filter reduces results', async ({ page }) => {
    const cb = xp(page, X.listing.functionCheckboxes).first();
    const label = (await cb.getAttribute('aria-label')) || '';
    const expected = Number((label.match(/([\d,]+) results?/) || ['', '0'])[1].replace(/,/g, ''));
    const before = await hrefsOf(page, '/press-releases');
    await cb.check({ force: true });
    await page.waitForLoadState('networkidle').catch(() => {});
    const apply = page.getByRole('button', { name: /^(apply|show \d[\d,]* results?)/i }).filter({ visible: true }).first();
    if (await apply.isVisible().catch(() => false)) await apply.click();
    await expect.poll(() => hrefsOf(page, '/press-releases')).not.toBe(before);
    if (expected > 0 && expected < 20) await expect(xp(page, X.listing.cards)).toHaveCount(expected);
  });

  test('function filter search box filters the checkbox list', async ({ page }) => {
    const all = await xp(page, X.listing.functionCheckboxes).count();
    await xp(page, X.listing.functionFilterSearch).fill('Co-operative');
    await expect.poll(() => xp(page, X.listing.functionCheckboxes).filter({ visible: true }).count()).toBeLessThanOrEqual(all);
    const labels = await xp(page, X.listing.functionCheckboxes).filter({ visible: true }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(labels.every((l) => /co-operative/i.test(l || ''))).toBe(true);
  });

  test('keyword search within press releases', async ({ page }) => {
    await xp(page, X.listing.keywordSearch).fill('Treasury Bills');
    await xp(page, X.listing.keywordSearch).press('Enter');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect.poll(async () => (await xp(page, X.listing.cardTitleLinks).first().innerText()).toLowerCase()).toContain('treasury');
  });

  test('sort toggles between newest and oldest', async ({ page }) => {
    const firstBefore = await xp(page, X.listing.cardTitleLinks).first().getAttribute('href');
    await xp(page, X.listing.sortSelect).click();
    await page.getByRole('option', { name: /oldest/i }).filter({ visible: true }).first().click();
    await expect.poll(() => xp(page, X.listing.cardTitleLinks).first().getAttribute('href')).not.toBe(firstBefore);
  });

  test('page size selector changes number of cards', async ({ page }) => {
    await xp(page, X.listing.pageSizeSelect).click();
    await page.getByRole('option', { name: /^50$/ }).filter({ visible: true }).first().click();
    await expect.poll(() => xp(page, X.listing.cards).count()).toBe(50);
  });

  test('next / previous page buttons', async ({ page }) => {
    const first = await xp(page, X.listing.cardTitleLinks).first().getAttribute('href');
    await xpVisible(page, X.listing.pagerNext).click();
    await expect.poll(() => xp(page, X.listing.cardTitleLinks).first().getAttribute('href')).not.toBe(first);
    await xpVisible(page, X.listing.pagerPrev).click();
    await expect.poll(() => xp(page, X.listing.cardTitleLinks).first().getAttribute('href')).toBe(first);
  });
});

test.describe('Press release detail page', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/press-releases');
    await xp(page, X.listing.cardTitleLinks).first().click();
    await page.waitForLoadState('domcontentloaded');
  });

  test('has title, breadcrumb, date and last-updated', async ({ page }) => {
    await expect(xp(page, X.detail.title)).toBeVisible();
    await expect(xp(page, X.detail.breadcrumb)).toContainText(/Press Releases/);
    await expect(xp(page, X.detail.date).first()).toHaveText(/\w+ \d{1,2}, \d{4}/);
    await expect.soft(xp(page, X.detail.lastUpdated)).toContainText(/Last Updated On/i);
  });

  test('PDF link downloads a real PDF and opens in a new tab', async ({ page, request }) => {
    const pdf = xp(page, X.detail.pdfLink).first();
    test.skip((await pdf.count()) === 0, 'no PDF attached');
    const href = (await pdf.getAttribute('href'))!;
    await expect.soft(pdf).toHaveAttribute('target', '_blank');
    const res = await request.get(new URL(href, page.url()).href, { failOnStatusCode: false });
    expect(res.status()).toBeLessThan(400);
    expect((await res.body()).subarray(0, 4).toString(), 'file is a PDF').toBe('%PDF');
  });

  test('breadcrumb links back to the listing', async ({ page }) => {
    await xp(page, X.detail.breadcrumb).getByRole('link', { name: /Press Releases/ }).click();
    await expect(page).toHaveURL(/\/press-releases$/);
  });
});

test.describe('Error handling', { tag: '@functional' }, () => {
  test('unknown URL returns 404 with a friendly page', async ({ page }) => {
    const res = await page.goto('/this-page-should-not-exist-e2e-check');
    expect(res?.status()).toBe(404);
    await expect(page.locator('main')).toContainText(/not found|404|doesn.t exist|does not exist/i);
    await expect(xp(page, X.header.logo)).toBeVisible();
  });

  test('sitemap.xml and robots.txt exist (SEO)', async ({ request }) => {
    // Checked on staging: both currently return 404.
    expect.soft((await request.get('/sitemap.xml', { failOnStatusCode: false })).status(), 'sitemap.xml').toBe(200);
    expect.soft((await request.get('/robots.txt', { failOnStatusCode: false })).status(), 'robots.txt').toBe(200);
  });
});
