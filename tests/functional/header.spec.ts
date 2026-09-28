import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { SiteHeader } from '../../src/pages/SiteHeader';
import { X, xp } from '../../src/locators/xpath';

test.describe('Header & navigation', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/');
  });

  test('logo is visible and links to the homepage', async ({ page }) => {
    const header = new SiteHeader(page);
    await expect(header.logo).toBeVisible();
    await gotoAndSettle(page, '/press-releases');
    await header.logo.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Press Releases nav link opens the listing', async ({ page, isMobile }) => {
    test.skip(isMobile, 'top nav collapses into the menu on mobile');
    const header = new SiteHeader(page);
    await header.pressReleases.click();
    await expect(page).toHaveURL(/\/press-releases$/);
    await expect(xp(page, X.listing.title)).toHaveText(/Press Releases/);
    await expect(header.pressReleases, 'active nav item marked as current page').toHaveAttribute('aria-current', 'page');
  });

  const dropdowns = [
    { name: 'About RBI', trigger: X.header.aboutRbiTrigger, panel: X.header.aboutRbiPanel },
    { name: 'Functions', trigger: X.header.functionsTrigger, panel: X.header.functionsPanel },
  ];
  for (const d of dropdowns) {
    test(`"${d.name}" mega-menu opens, links work, and closes`, async ({ page, request, isMobile }) => {
      test.skip(isMobile, 'top nav collapses into the menu on mobile');
      const trigger = xp(page, d.trigger);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const links = xp(page, d.panel).locator('a[href]').filter({ visible: true });
      await expect(links.first()).toBeVisible();
      const hrefs = await links.evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).href))]);
      expect(hrefs.length, 'links in mega-menu').toBeGreaterThan(2);
      for (const h of hrefs) {
        const res = await request.get(h, { failOnStatusCode: false });
        expect.soft(res.status(), h).toBeLessThan(400);
      }

      await page.keyboard.press('Escape');
      await expect.soft(trigger, 'Escape closes the mega-menu').toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('only one mega-menu is open at a time', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop nav');
    const header = new SiteHeader(page);
    await header.aboutRbi.click();
    await header.functions.click();
    await expect(header.functions).toHaveAttribute('aria-expanded', 'true');
    await expect(header.aboutRbi).toHaveAttribute('aria-expanded', 'false');
  });

  test('hamburger menu opens, lists sections and closes', async ({ page }) => {
    const header = new SiteHeader(page);
    const menu = xp(page, X.navMenu.root);
    await expect(menu).toBeHidden();
    await header.menuBtn.click();
    await expect(menu).toBeVisible();
    await expect(header.menuBtn).toHaveAttribute('aria-expanded', 'true');
    expect(await xp(page, X.navMenu.links).filter({ visible: true }).count()).toBeGreaterThan(5);

    const close = menu.getByRole('button', { name: /close/i }).first();
    if (await close.isVisible().catch(() => false)) await close.click();
    else await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  });

  test('every link in the hamburger menu resolves (no 4xx/5xx)', async ({ page, request }) => {
    const hrefs = await xp(page, X.navMenu.links).evaluateAll((els) =>
      [...new Set(els.map((a) => (a as HTMLAnchorElement).href).filter((h) => h.startsWith(location.origin)))],
    );
    expect(hrefs.length).toBeGreaterThan(5);
    const bad: string[] = [];
    for (const h of hrefs) {
      const res = await request.get(h, { failOnStatusCode: false });
      if (res.status() >= 400) bad.push(`${res.status()} ${h}`);
    }
    expect(bad).toEqual([]);
  });

  test('"Skip to main content" moves focus into main', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.skipLink.click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = document.activeElement;
          return !!a && (a.tagName === 'MAIN' || !!a.closest('main') || (location.hash.length > 1 && !!document.querySelector(location.hash)?.closest('main')));
        }),
      )
      .toBe(true);
  });

  test('skip link is the first thing keyboard users reach', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard test');
    await page.keyboard.press('Tab');
    const isSkip = await xp(page, X.header.skipToMain).evaluate((el) => el === document.activeElement);
    // WCAG 2.4.1 good practice — soft so it is reported without blocking the run
    expect.soft(isSkip, 'first Tab stop should be "Skip to main content"').toBe(true);
  });

  test('header stays usable after scrolling (sticky header)', async ({ page }) => {
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(500);
    await expect(new SiteHeader(page).menuBtn).toBeInViewport();
  });
});
