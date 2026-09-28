import { Page, Locator, expect } from '@playwright/test';
import { X, xp, xpVisible } from '../locators/xpath';

/**
 * Header page object. All selectors come from src/locators/xpath.ts (taken from the live DOM).
 * On mobile the desktop search/language controls live inside the hamburger menu (#site-navmenu).
 */
export class SiteHeader {
  readonly root: Locator;
  readonly logo: Locator;
  readonly searchBox: Locator;
  readonly searchSubmit: Locator;
  readonly accessibilityBtn: Locator;
  readonly languageBtn: Locator;
  readonly skipLink: Locator;
  readonly menuBtn: Locator;
  readonly aboutRbi: Locator;
  readonly functions: Locator;
  readonly pressReleases: Locator;

  constructor(readonly page: Page) {
    this.root = xp(page, X.header.root).first();
    this.logo = xp(page, X.header.logo);
    this.searchBox = xp(page, X.header.searchInput);
    this.searchSubmit = xp(page, X.header.searchSubmit);
    this.accessibilityBtn = xp(page, X.header.accessibilityBtn);
    this.languageBtn = xp(page, X.header.languageBtn);
    this.skipLink = xp(page, X.header.skipToMain);
    this.menuBtn = xp(page, X.header.menuBtn);
    this.aboutRbi = xp(page, X.header.aboutRbiTrigger);
    this.functions = xp(page, X.header.functionsTrigger);
    this.pressReleases = xp(page, X.header.pressReleasesLink);
  }

  navItem(text: string | RegExp): Locator {
    return this.root.locator('a, button').filter({ hasText: text }).first();
  }

  /** Types into whichever search box is on screen (header on desktop, nav menu on mobile) and submits. */
  async search(term: string) {
    let box = this.searchBox;
    if (!(await box.isVisible())) {
      await this.menuBtn.click();
      box = xpVisible(this.page, X.navMenu.searchInput);
    }
    await expect(box).toBeVisible();
    await box.fill(term);
    await box.press('Enter');
    await this.page.waitForURL(/\/search/, { timeout: 15_000 }).catch(() => {});
  }
}

/** Count links that are currently visible — used to detect menus/panels opening. */
export async function visibleLinkCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('a[href]')].filter((a) => {
        const r = (a as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0';
      }).length,
  );
}

/**
 * Serialises everything the accessibility toolbar changes. On this site the toolbar writes
 * inline styles on <body> (font-size, line-height, …) and classes like `a11y-dark`.
 * `has-a11y-open` only means the panel is open, so it is ignored.
 */
export async function presentationState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const h = document.documentElement;
    const b = document.body;
    const clean = (c: string) => c.split(/\s+/).filter((x) => x && x !== 'has-a11y-open').sort().join(' ');
    const hs = getComputedStyle(h);
    const bs = getComputedStyle(b);
    return JSON.stringify({
      hClass: clean(h.className),
      bClass: clean(b.className),
      hStyle: h.getAttribute('style'),
      bStyle: (b.getAttribute('style') || '').replace(/--scrollbar-gap:[^;]*;?/, '').trim(),
      hData: Object.assign({}, h.dataset),
      bData: Object.assign({}, b.dataset),
      hFont: hs.fontSize,
      bFont: bs.fontSize,
      filter: hs.filter + bs.filter,
      bg: bs.backgroundColor,
      color: bs.color,
      imgs: [...document.images].slice(0, 5).map((i) => getComputedStyle(i).visibility + getComputedStyle(i).opacity).join(),
      cursor: bs.cursor,
    });
  });
}
