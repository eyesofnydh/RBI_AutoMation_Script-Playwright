import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { seedPaths } from '../../src/config';

/**
 * Layout checks across breakpoints. Runs in both desktop and mobile projects;
 * the desktop project additionally sweeps tablet/small-laptop widths.
 */
const widths = [375, 768, 1024, 1280];
const pages = seedPaths.slice(0, 12);

test.describe('Responsive layout', { tag: '@functional' }, () => {
  for (const path of pages) {
    test(`no horizontal overflow on ${path}`, async ({ page, isMobile }) => {
      const sizes = isMobile ? [page.viewportSize()!.width] : widths;
      const problems: string[] = [];
      for (const w of sizes) {
        if (!isMobile) await page.setViewportSize({ width: w, height: 900 });
        await gotoAndSettle(page, path);
        const res = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const offenders = [...document.querySelectorAll('body *')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.right > vw + 1 && s.position !== 'fixed' && !el.closest('[aria-hidden="true"], .swiper, .slick-track, [class*="carousel" i], [class*="slider" i]');
            })
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].slice(0, 2).join('.')}`);
          return { overflow: document.documentElement.scrollWidth - vw, offenders };
        });
        if (res.overflow > 1) problems.push(`${w}px: overflow ${res.overflow}px — ${res.offenders.join(', ')}`);
      }
      expect(problems).toEqual([]);
    });
  }

  test('mobile: tap targets in header are at least 24px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await gotoAndSettle(page, '/');
    const small = await page.locator('header a:visible, header button:visible').evaluateAll((els) =>
      els
        .map((e) => ({ r: e.getBoundingClientRect(), n: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30) }))
        .filter(({ r }) => r.width < 24 || r.height < 24)
        .map(({ r, n }) => `${n || '(unnamed)'} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect.soft(small).toEqual([]);
  });

  test('mobile: menu opens full navigation', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await gotoAndSettle(page, '/');
    await page.getByRole('button', { name: /open menu|menu/i }).first().click();
    await expect(page.getByText(/About RBI/i).first()).toBeVisible();
    await expect(page.getByText(/Functions/i).first()).toBeVisible();
  });
});
