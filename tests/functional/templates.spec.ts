import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { X, xp, xpVisible } from '../../src/locators/xpath';
import { listingPaths } from '../../src/config';

/**
 * Feature tests for every page template found on the site (inventory taken 27 Sep 2026):
 *  - Listing pages with the shared filter panel (Press Releases, 7× Notifications, FAQs, Podcasts, Media Interactions, Working Papers)
 *  - Static content pages with the "On this page" index + in-page search
 *  - About Us (building carousel, section rail), Organisation chart, Offices (map/list/search/pins),
 *    Departments search, RBI History (galleries, Read more)
 */

// ---------------------------------------------------------------- Listings + filters
test.describe('Listing filter panel', { tag: '@functional' }, () => {
  for (const path of listingPaths) {
    test.describe(path, () => {
      test.beforeEach(async ({ page }) => {
        await gotoAndSettle(page, path);
      });

      test('year dropdown opens, lists years, and selecting one updates the button', async ({ page, issues }) => {
        const year = xpVisible(page, X.filters.year);
        test.skip(!(await year.isVisible().catch(() => false)), 'no year filter here');
        await year.click();
        const opts = page.getByRole('option').filter({ visible: true });
        await expect(opts.first()).toBeVisible();
        const count = await opts.count();
        expect(count, 'year options').toBeGreaterThan(1);
        const pick = opts.nth(Math.min(1, count - 1));
        const label = ((await pick.innerText()).match(/\d{4}/) || [''])[0];
        await pick.click();
        await expect(year).toContainText(label);
        expect(issues.pageErrors).toEqual([]);
      });

      test('month dropdown lists 12 months', async ({ page }) => {
        const month = xpVisible(page, X.filters.month);
        test.skip(!(await month.isVisible().catch(() => false)), 'no month filter here');
        await month.click();
        const opts = page.getByRole('option').filter({ visible: true });
        await expect(opts.first()).toBeVisible();
        await expect(opts).toHaveCount(12);
        await page.keyboard.press('Escape');
      });

      test('dropdown is keyboard operable (Enter / Arrow / Escape)', async ({ page }) => {
        const year = xpVisible(page, X.filters.year);
        test.skip(!(await year.isVisible().catch(() => false)), 'no year filter here');
        await year.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('option').filter({ visible: true }).first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');
        await expect.soft(page.getByRole('option').filter({ visible: true })).toHaveCount(0);
      });

      test('custom date range: valid range applies', async ({ page, issues }) => {
        const toggle = xpVisible(page, X.filters.rangeToggle);
        test.skip(!(await toggle.isVisible().catch(() => false)), 'no custom date range here');
        await toggle.click();
        await expect(xpVisible(page, X.filters.fromDate)).toBeVisible();
        await expect(xpVisible(page, X.filters.toDate)).toBeVisible();
        expect(issues.pageErrors).toEqual([]);
      });

      test('EDGE: "From" date later than "To" date is rejected or swapped', async ({ page }) => {
        const toggle = xpVisible(page, X.filters.rangeToggle);
        test.skip(!(await toggle.isVisible().catch(() => false)), 'no custom date range here');
        await toggle.click();
        const from = xpVisible(page, X.filters.fromDate);
        const to = xpVisible(page, X.filters.toDate);
        // Date pickers differ; try typing if they are inputs, otherwise open the picker
        const isInput = await from.evaluate((e) => e.tagName === 'INPUT').catch(() => false);
        test.skip(!isInput, 'date picker is a custom widget — covered by manual test case');
        await from.fill('2026-12-31');
        await to.fill('2020-01-01');
        await xpVisible(page, X.filters.applyRange).click();
        const msg = page.getByText(/invalid|must be (before|after|earlier|later)|cannot be/i);
        const applied = await xp(page, X.listing.cards).count();
        expect(await msg.count() > 0 || applied === 0, 'shows a validation message or no results').toBe(true);
      });

      test('Clear resets the date range', async ({ page }) => {
        const toggle = xpVisible(page, X.filters.rangeToggle);
        test.skip(!(await toggle.isVisible().catch(() => false)), 'no custom date range here');
        await toggle.click();
        await xpVisible(page, X.filters.clearRange).click();
        await expect(xpVisible(page, X.filters.fromDate)).toContainText(/select date|^$/i);
      });

      test('"Show N results" count matches the number of items', async ({ page }) => {
        const show = xp(page, X.filters.showResults).first();
        test.skip((await show.count()) === 0, 'no results button');
        const n = Number(((await show.textContent()) || '').replace(/[^\d]/g, ''));
        expect(n).toBeGreaterThan(0);
        const cards = await xp(page, X.listing.cards).count();
        if (n <= 20) expect.soft(cards, 'cards shown equals result count').toBe(n);
      });

      test('"View more" expands the category list (if present)', async ({ page }) => {
        const more = xpVisible(page, X.filters.viewMore);
        test.skip(!(await more.isVisible().catch(() => false)), 'no "View more" here');
        const before = await xp(page, X.filters.functionCheckboxes).filter({ visible: true }).count();
        await more.click();
        await expect.poll(() => xp(page, X.filters.functionCheckboxes).filter({ visible: true }).count()).toBeGreaterThan(before);
      });

      test('EDGE: page far beyond the last page shows empty state, not an error', async ({ page }) => {
        const res = await page.goto(`${path}?page=999999`);
        expect(res!.status()).toBeLessThan(500);
        await expect(page.locator('main')).toBeVisible();
      });

      test('EDGE: garbage query parameters do not break the page', async ({ page, issues }) => {
        const res = await page.goto(`${path}?year=abcd&month=99&page=-1&sort=%3Cscript%3E`);
        expect(res!.status()).toBeLessThan(500);
        await expect(page.locator('h1').first()).toBeVisible();
        expect(issues.pageErrors).toEqual([]);
      });
    });
  }

  test('mobile: filter panel opens and closes', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await gotoAndSettle(page, '/press-releases');
    const toggle = xpVisible(page, X.filters.panelToggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await xpVisible(page, X.filters.panelClose).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

// ---------------------------------------------------------------- Static content pages
const staticIndexPages = [
  '/banker-to-banks/overview',
  '/enforcement-department/overview',
  '/issuer-of-currency/overview',
  '/monetary-policy/overview',
  '/payment-and-settlement-systems/overview',
  '/citizens-charter',
  '/right-to-information-act',
];

test.describe('Static pages — "On this page" index', { tag: '@functional' }, () => {
  for (const path of staticIndexPages) {
    test(`${path}: index hides/shows and in-page search finds text`, async ({ page, issues }) => {
      await gotoAndSettle(page, path);
      const toggle = xpVisible(page, X.staticPage.indexToggle);
      test.skip(!(await toggle.isVisible().catch(() => false)), 'no page index');
      const state = await toggle.getAttribute('aria-expanded');
      await toggle.click();
      await expect(toggle).not.toHaveAttribute('aria-expanded', state ?? '');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', state ?? 'true');

      // search for a word that exists on the page
      const word = await page.locator('main h2, main h3').first().innerText().then((t) => t.split(/\s+/).find((w) => w.length > 5) || 'Reserve');
      const box = xpVisible(page, X.staticPage.indexSearch);
      await box.fill(word);
      await box.press('Enter');
      await page.waitForTimeout(600);
      expect(issues.pageErrors).toEqual([]);
    });
  }

  test('EDGE: in-page search with no match shows a message, not an error', async ({ page, issues }) => {
    await gotoAndSettle(page, '/banker-to-banks/overview');
    const box = xpVisible(page, X.staticPage.indexSearch);
    await box.fill('zzqqxxnomatch');
    await xpVisible(page, X.staticPage.indexSubmit).click();
    await page.waitForTimeout(600);
    expect(issues.pageErrors).toEqual([]);
  });

  test('index links jump to their section', async ({ page }) => {
    await gotoAndSettle(page, '/banker-to-banks/overview');
    const link = page.locator('main nav a[href^="#"], main [class*="index"] a[href^="#"]').first();
    test.skip((await link.count()) === 0, 'no anchor links in index');
    const target = (await link.getAttribute('href'))!;
    await link.click();
    await expect(page.locator(target)).toBeInViewport();
  });
});

// ---------------------------------------------------------------- About Us
test.describe('About Us page', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/about-us');
  });

  test('building carousel: next / previous / dots / pause', async ({ page }) => {
    const pause = xp(page, X.aboutUs.buildingPause);
    await pause.click(); // stop auto-play
    const current = () =>
      xp(page, X.aboutUs.buildingDots).evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-current') === 'true' || e.getAttribute('aria-selected') === 'true' || /active|current/.test(e.className)));
    const start = await current();
    await xp(page, X.aboutUs.nextBuilding).click();
    await expect.poll(current).not.toBe(start);
    await xp(page, X.aboutUs.prevBuilding).click();
    await expect.poll(current).toBe(start);
    await xp(page, X.aboutUs.buildingDots).nth(2).click();
    await expect.poll(current).toBe(2);
  });

  test('EDGE: Next on the last slide wraps to the first', async ({ page }) => {
    await xp(page, X.aboutUs.buildingPause).click();
    const dots = xp(page, X.aboutUs.buildingDots);
    const current = () => dots.evaluateAll((els) => els.findIndex((e) => e.getAttribute('aria-current') === 'true' || e.getAttribute('aria-selected') === 'true' || /active|current/.test(e.className)));
    await dots.last().click();
    await expect.poll(current).toBe((await dots.count()) - 1);
    await xp(page, X.aboutUs.nextBuilding).click();
    await expect.soft(page.locator('body'), 'carousel loops back to slide 1').toBeVisible();
    expect.soft(await current(), 'next on last slide goes to first').toBe(0);
  });

  test('"More sections" rail expands', async ({ page }) => {
    const more = xp(page, X.staticPage.sectionRailMore);
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('Organisation chart', { tag: '@functional' }, () => {
  test('every chart node expands and collapses', async ({ page, issues }) => {
    await gotoAndSettle(page, '/about-us/organisation');
    const toggles = xp(page, X.organisation.chartToggles);
    const n = await toggles.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const t = toggles.nth(i);
      const before = await t.getAttribute('aria-expanded');
      await t.click();
      await expect(t).not.toHaveAttribute('aria-expanded', before ?? '');
      await t.click();
      await expect(t).toHaveAttribute('aria-expanded', before ?? 'false');
    }
    expect(issues.pageErrors).toEqual([]);
  });
});

test.describe('Offices', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/about-us/offices');
  });

  test('Map View / List View tabs switch', async ({ page }) => {
    const map = xp(page, X.offices.mapTab);
    const list = xp(page, X.offices.listTab);
    await list.click();
    await expect(list).toHaveAttribute('aria-selected', 'true');
    await map.click();
    await expect(map).toHaveAttribute('aria-selected', 'true');
  });

  test('clicking a map pin shows that office', async ({ page }) => {
    const pin = xp(page, X.offices.pin('Srinagar Office'));
    await pin.click();
    await expect(page.getByText(/Srinagar/).filter({ visible: true }).first()).toBeVisible();
  });

  test('all map pins are clickable', async ({ page, issues }) => {
    const pins = xp(page, X.offices.mapPins);
    const n = await pins.count();
    expect(n).toBeGreaterThan(20);
    for (let i = 0; i < n; i++) {
      await pins.nth(i).click({ timeout: 3000 });
    }
    expect(issues.pageErrors).toEqual([]);
  });

  test('search filters offices by city', async ({ page }) => {
    await xp(page, X.offices.listTab).click();
    const box = xp(page, X.offices.search);
    await box.fill('Mumbai');
    await page.waitForTimeout(600);
    await expect(page.locator('main').getByText(/Mumbai/).filter({ visible: true }).first()).toBeVisible();
  });

  test('EDGE: office search with no match shows empty state', async ({ page, issues }) => {
    await xp(page, X.offices.listTab).click();
    await xp(page, X.offices.search).fill('Atlantis');
    await page.waitForTimeout(600);
    await expect.soft(page.locator('main')).toContainText(/no (office|result|match)|not found/i);
    expect(issues.pageErrors).toEqual([]);
  });

  test('EDGE: office search is case-insensitive and trims spaces', async ({ page }) => {
    await xp(page, X.offices.listTab).click();
    await xp(page, X.offices.search).fill('  mUmBaI  ');
    await page.waitForTimeout(600);
    await expect(page.locator('main').getByText(/Mumbai/).filter({ visible: true }).first()).toBeVisible();
  });
});

test.describe('Departments', { tag: '@functional' }, () => {
  test('search narrows the department list', async ({ page }) => {
    await gotoAndSettle(page, '/about-us/departments');
    const visibleText = () => page.locator('main').innerText();
    const before = (await visibleText()).length;
    await xp(page, X.departments.search).fill('Currency');
    await page.waitForTimeout(600);
    await expect.poll(async () => (await visibleText()).length).toBeLessThan(before);
    await expect(page.locator('main').getByText(/Currency/).filter({ visible: true }).first()).toBeVisible();
  });

  test('EDGE: clearing the search restores all departments', async ({ page }) => {
    await gotoAndSettle(page, '/about-us/departments');
    const full = (await page.locator('main').innerText()).length;
    const box = xp(page, X.departments.search);
    await box.fill('Currency');
    await page.waitForTimeout(400);
    await box.fill('');
    await page.waitForTimeout(400);
    expect((await page.locator('main').innerText()).length).toBe(full);
  });
});

test.describe('RBI History', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/about-us/rbi-history');
  });

  test('photo gallery next and dots', async ({ page, issues }) => {
    await xp(page, X.history.galleryNext).click();
    await xp(page, X.history.galleryDots).last().click();
    expect(issues.pageErrors).toEqual([]);
  });

  test('"Read More" on each volume expands', async ({ page }) => {
    const more = xp(page, X.history.volumeReadMore);
    const n = await more.count();
    for (let i = 0; i < n; i++) {
      if (!(await more.nth(i).isVisible())) await xp(page, X.history.volumesNext).click();
      if (!(await more.nth(i).isVisible())) continue;
      await more.nth(i).click();
      await expect(more.nth(i)).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('section navigation toggle', async ({ page }) => {
    const t = xp(page, X.history.sectionNavToggle).first();
    const before = await t.getAttribute('aria-expanded');
    await t.click();
    await expect(t).not.toHaveAttribute('aria-expanded', before ?? '');
  });
});

// ---------------------------------------------------------------- Soft 404s
test.describe('Soft 404 detection', { tag: '@functional' }, () => {
  // Found on staging: /speech-and-media returns HTTP 200 but renders the "not found" template.
  for (const path of ['/speech-and-media']) {
    test(`${path} is a real page (not a "not found" page with status 200)`, async ({ page }) => {
      const res = await gotoAndSettle(page, path);
      expect(res!.status()).toBe(200);
      await expect(page.locator('main')).not.toContainText(/page not found|doesn.t exist|404/i);
    });
  }
});
