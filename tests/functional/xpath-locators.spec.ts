import { test, expect, gotoAndSettle } from '../../src/fixtures';
import type { Locator, Page } from '@playwright/test';
import { X, xp } from '../../src/locators/xpath';

/**
 * Locator health check: every XPath in src/locators/xpath.ts must match at least one element
 * on the page it belongs to. Run this first after a deploy — if the markup changed,
 * this tells you exactly which locator to update.
 *
 *   npx playwright test xpath-locators --project=desktop-chrome
 */

type Group = keyof typeof X;
const pageFor: Record<Group, string> = {
  header: '/',
  navMenu: '/',
  a11yPanel: '/',
  home: '/',
  footer: '/',
  generic: '/',
  listing: '/press-releases',
  detail: '__first_press_release__',
  search: '/search?q=repo%20rate',
  filters: '/speech-and-media/podcasts',
  staticPage: '/banker-to-banks/overview',
  aboutUs: '/about-us',
  organisation: '/about-us/organisation',
  offices: '/about-us/offices',
  departments: '/about-us/departments',
  history: '/about-us/rbi-history',
};

/** Arguments used to exercise the parameterised locators. */
const sampleArgs: Record<string, unknown> = {
  tile: 'Increase Text',
  quickTab: 'notifications',
  quickPanel: 'notifications',
  hubInnerTabs: 'citizen-s-centre',
  rateTab: 'policy-rates',
  ratePanel: 'policy-rates',
  functionCheckbox: 'About Us',
  pagerPage: 2,
  pin: 'Srinagar Office',
  // footer.rel.*
  heading: 'Quick Links',
  section: 'Quick Links',
  sectionLinks: 'Quick Links',
  linksAfterHeading: 'Need Help',
  social: 'youtube',
  nthListItemLinks: 1,
};

/** Locators that legitimately match nothing until an interaction, or are checked elsewhere. */
const skip = new Set([
  'home.updatedTodayPanel', // rendered after clicking its tab
  'search.noResults', // only on an empty search
  'generic.imagesWithoutAlt', // should be 0 — asserted in pages.spec
  'generic.visibleH1', // homepage h1 is intentionally screen-reader-only
  'a11yPanel.tileNames',
  'filters.functionSearch', // not on podcasts (covered on /press-releases)
  'filters.functionCheckboxes',
  'filters.viewMore',
  'filters.visibleOptions', // only while a dropdown is open
  'staticPage.accordionToggles',
  'staticPage.sectionRailMore', // only on some static pages
  'footer.rel.linkByText', // needs a real link label
  'footer.rel.headingOfLink',
  'footer.rel.unnamedLinks', // should be 0 — asserted in footer.spec
  'footer.rel.deadLinks',
  'footer.rel.unsafeBlankLinks',
  'footer.rel.lastUpdated', // optional on the site
  'footer.rel.backToTop',
]);

test.describe('XPath locator health', { tag: ['@functional', '@locators'] }, () => {
  test.skip(({ isMobile }) => isMobile, 'desktop DOM');

  for (const group of Object.keys(X) as Group[]) {
    test(`${group} locators match on ${pageFor[group]}`, async ({ page }) => {
      if (pageFor[group] === '__first_press_release__') {
        await gotoAndSettle(page, '/press-releases');
        await xp(page, X.listing.cardTitleLinks).first().click();
        await page.waitForLoadState('domcontentloaded');
      } else {
        await gotoAndSettle(page, pageFor[group]);
      }

      const missing: string[] = [];
      // Nested groups (e.g. footer.rel) hold relative XPaths ("./…"), resolved inside the group's root.
      const check = async (entries: Record<string, unknown>, prefix: string, scope: Page | Locator) => {
        for (const [name, value] of Object.entries(entries)) {
          const key = `${prefix}.${name}`;
          if (skip.has(key)) continue;
          let xpath: string;
          if (typeof value === 'string') xpath = value;
          else if (typeof value === 'function') xpath = (value as (a: unknown) => string)(sampleArgs[name]);
          else if (value && typeof value === 'object' && !Array.isArray(value)) {
            const root = (X[group] as Record<string, unknown>).root;
            await check(value as Record<string, unknown>, key, typeof root === 'string' ? xp(page, root) : page);
            continue;
          } else continue;
          const count = await xp(scope, xpath).count();
          if (count === 0) missing.push(`${key}  →  ${xpath}`);
        }
      };
      await check(X[group] as Record<string, unknown>, group, page);
      expect(missing, `XPath locators with no match on ${page.url()}`).toEqual([]);
    });
  }

  test('lazy locators appear after interaction', async ({ page }) => {
    await gotoAndSettle(page, '/');
    await xp(page, X.home.updatedTodayTab).click();
    await expect(xp(page, X.home.updatedTodayPanel)).toHaveCount(1);
    await gotoAndSettle(page, '/search?q=zqxwvkjhg123nonexistent');
    await expect(xp(page, X.search.noResults)).toHaveCount(1);
  });
});
