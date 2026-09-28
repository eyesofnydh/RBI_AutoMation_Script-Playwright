import { test, gotoAndSettle } from '../../src/fixtures';
import { SiteFooter } from '../../src/pages/SiteFooter';
import { X, xp } from '../../src/locators/xpath';
import {
  boxes,
  checkLinks,
  collectLinks,
  hostOf,
  isDeadHref,
  isInternal,
  linkName,
  log,
  pathOf,
  scrollToBottom,
  SoftAssert,
  uniqueHrefs,
} from '../../src/utils';

/**
 * Footer (test cases: "10. FOOTER" in RBI-Test-Cases.xlsx).
 *
 * Uses the `soft` fixture (SoftAssert): every check in a test runs and is logged to the
 * Extent report; all failures are raised together when the test ends.
 * Locators: absolute XPath for the footer root, relative XPaths (X.footer.rel) inside it.
 */

/** Footer links that 404 on staging (README "Known issues", defects D-02…D-07). */
const knownBroken: Record<string, string> = {
  '/opportunities': 'D-02',
  '/important-websites': 'D-03',
  '/bank-holidays': 'D-04',
  '/rbi-clarifications': 'D-05',
  '/forms': 'D-06',
  '/about-rbi/vision-and-values': 'D-07',
};

test.describe('Footer', { tag: ['@functional', '@footer'] }, () => {
  test.beforeEach(async ({ page, footer }) => {
    await gotoAndSettle(page, '/');
    await footer.scrollIntoView();
  });

  test('footer renders with its main sections', async ({ footer, soft }) => {
    await soft.visible(footer.root, 'footer is visible');
    await soft.countAtLeast(footer.links, 6, 'footer has at least 6 links');
    await soft.visible(footer.quickLinksHeading, '"Quick Links" heading is visible');
    await soft.visible(footer.needHelpHeading, '"Need Help" heading is visible');
    await soft.countAtLeast(footer.sectionLinks('Quick Links'), 3, 'Quick Links column has links');
    await soft.countAtLeast(footer.sectionLinks('Need Help'), 1, 'Need Help column has links');
    await soft.countAtLeast(footer.socialLinks, 1, 'social media links are present');
    await soft.visible(footer.copyright, 'copyright line is visible');
  });

  test('Quick Links all resolve (no 4xx/5xx)', async ({ footer, request, soft }) => {
    await checkSection(footer, request, soft, 'Quick Links');
  });

  test('Need Help links resolve (no 4xx/5xx)', async ({ footer, request, soft }) => {
    await checkSection(footer, request, soft, 'Need Help');
  });

  test('social icons point at the official profiles and open safely in a new tab', async ({ footer, soft }) => {
    for (const network of SiteFooter.socialNetworks) {
      const link = footer.social(network);
      if (!(await soft.countAtLeast(link, 1, `${network} link is present`))) continue;
      const [info] = await collectLinks(link);
      await soft.isFalse(isInternal(info.href), `${network}: points off-site (${hostOf(info.href)})`);
      await soft.equals(info.target, '_blank', `${network}: opens in a new tab`);
      await soft.matches(info.rel, /noopener|noreferrer/, `${network}: rel=noopener`);
      await soft.isTrue(linkName(info) || (await link.locator('xpath=.//img[@alt!=""] | .//*[local-name()="title"]').count()), `${network}: has an accessible name`);
      await soft.matches(info.href, /rbi|reservebank/i, `${network}: profile URL looks like RBI's (${info.href})`);
    }
  });

  test('every footer link has a name and a real destination', async ({ footer, soft }) => {
    const links = await footer.linkInfo();
    log.info(`${links.length} links in the footer`);
    await soft.isEmpty(links.filter((l) => isDeadHref(l.rawHref)).map((l) => `${linkName(l) || '(no name)'} → "${l.rawHref}"`), 'no "#", empty or javascript: links');
    await soft.isEmpty(links.filter((l) => !linkName(l)).map((l) => l.href), 'every link has text / aria-label / title');
    await soft.count(footer.rel(X.footer.rel.unsafeBlankLinks), 0, 'target=_blank links carry rel=noopener');

    // Same text must not lead to two different places (copy/paste mistakes in the CMS)
    const byName = new Map<string, Set<string>>();
    for (const l of links.filter((x) => x.text)) byName.set(l.text, (byName.get(l.text) ?? new Set()).add(l.href));
    const conflicting = [...byName].filter(([, hrefs]) => hrefs.size > 1).map(([name, hrefs]) => `${name}: ${[...hrefs].join(', ')}`);
    await soft.isEmpty(conflicting, 'the same link text never points to different URLs');
  });

  test('copyright shows the current year', async ({ footer, soft }) => {
    const text = await footer.copyrightText();
    log.info(`Copyright text: "${text}"`);
    const years = await footer.copyrightYears();
    await soft.contains(years, new Date().getFullYear(), `copyright contains ${new Date().getFullYear()}`);
    await soft.matches(text, /Reserve Bank of India|RBI/i, 'copyright names the Reserve Bank of India');

    if (await footer.lastUpdated.count()) {
      const updated = (await footer.lastUpdated.innerText()).replace(/\s+/g, ' ').trim();
      log.info(`Last updated: "${updated}"`);
      const date = Date.parse(updated.replace(/.*last updated\s*:?\s*/i, ''));
      if (!Number.isNaN(date)) await soft.isTrue(date <= Date.now(), '"Last updated" is not in the future');
    } else {
      log.warning('No "Last updated" text in the footer');
    }
  });

  test('clicking a Quick Link navigates within the site', async ({ page, footer, soft }) => {
    const links = await collectLinks(footer.sectionLinks('Quick Links'));
    const target = links.find((l) => isInternal(l.href) && l.target !== '_blank' && !knownBroken[pathOf(l.href)] && l.visible);
    test.skip(!target, 'no clickable internal Quick Link');
    await footer.rel(`.//a[@href="${target!.rawHref}"]`).first().click();
    await soft.url(page, new RegExp(`${pathOf(target!.href).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), `"${target!.text}" opens ${pathOf(target!.href)}`);
    await soft.visible(new SiteFooter(page).root, 'footer is present on the destination page');
  });

  test('footer is the same on other pages', async ({ page, soft }) => {
    const signature = async () => (await collectLinks(xp(page, X.footer.links))).map((l) => `${l.text}|${pathOf(l.href)}`).sort();
    const home = await signature();
    for (const path of ['/press-releases', '/about-us', '/faqs']) {
      await gotoAndSettle(page, path);
      await soft.visible(xp(page, X.footer.root), `${path}: footer is visible`);
      const here = await signature();
      await soft.isEmpty(home.filter((l) => !here.includes(l)), `${path}: has every homepage footer link`);
    }
  });

  test('mobile: columns stack and links are tappable', async ({ page, footer, soft, isMobile }) => {
    test.skip(!isMobile, 'mobile layout check');
    await scrollToBottom(page);
    const links = (await footer.linkInfo()).filter((l) => l.visible);
    const small = links.filter((l) => l.width < 24 || l.height < 24).map((l) => `${linkName(l) || l.href} ${l.width}×${l.height}`);
    await soft.isEmpty(small, 'tap targets are at least 24×24 px (WCAG 2.5.8)');

    const quick = await boxes(footer.section('Quick Links'));
    const help = await boxes(footer.section('Need Help'));
    if (quick[0] && help[0]) {
      const [a, b] = quick[0].y <= help[0].y ? [quick[0], help[0]] : [help[0], quick[0]];
      await soft.isTrue(b.y >= a.y + a.h - 1, 'Quick Links and Need Help are stacked, not side by side');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await soft.lessThan(overflow, 2, 'no horizontal scroll caused by the footer');
  });
});

/** Checks every link of one footer column; known staging defects are reported as warnings. */
async function checkSection(
  footer: SiteFooter,
  request: Parameters<typeof checkLinks>[0],
  soft: SoftAssert,
  title: string,
) {
  const links = await collectLinks(footer.sectionLinks(title));
  const hrefs = uniqueHrefs(links);
  await soft.greaterThan(hrefs.length, 0, `"${title}" has links to check`);
  for (const r of await checkLinks(request, hrefs)) {
    const name = links.find((l) => l.href.split('#')[0] === r.href)?.text || r.href;
    const defect = isInternal(r.href) ? knownBroken[pathOf(r.href)] : undefined;
    if (!r.ok && defect) {
      log.warning(`${name} → ${r.status} (known defect ${defect})`);
      test.info().annotations.push({ type: 'known defect', description: `${defect}: ${r.href} → ${r.status}` });
    }
    await soft.isTrue(r.ok, `${name} → ${r.status || r.error} (${r.href})`);
  }
}
