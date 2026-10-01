import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { X, xp } from '../../src/locators/xpath';

const hubs = [
  { id: 'notifications', label: 'Notifications' },
  { id: 'citizen-s-centre', label: "Citizen's Centre" },
  { id: 'research-publication', label: 'Publications & Research' },
  { id: 'speeches-and-media', label: 'Speeches & Media' },
] as const;

const rateTabs = ['policy-rates', 'reserve-ratios', 'exchange-rates', 'lending-deposit-rates', 'market-trends'] as const;

test.describe('Homepage', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/');
  });

  test('title, hidden h1 and vision statement render', { tag: '@smoke' }, async ({ page }) => {
    await expect(page).toHaveTitle(/Reserve Bank of India/i);
    await expect(xp(page, X.home.srOnlyH1)).toHaveText(/Reserve Bank of India/);
    await expect(xp(page, X.home.heroText)).toBeVisible();
    await expect(page.getByText(/Vision Statement/i).first()).toBeVisible();
  });

  for (const hub of hubs) {
    test(`quick-access "${hub.label}" expands its panel with links`, async ({ page }) => {
      const trigger = xp(page, X.home.quickTab(hub.id));
      await expect(trigger).toHaveText(new RegExp(hub.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = xp(page, X.home.quickPanel(hub.id));
      await expect(panel).toBeVisible();
      expect(await panel.locator('a[href]').count(), 'links inside panel').toBeGreaterThan(0);

      // Inner tabs (e.g. Services / Information / Useful Links) each show content
      const inner = xp(page, X.home.hubInnerTabs(hub.id));
      const n = await inner.count();
      for (let i = 0; i < n; i++) {
        await inner.nth(i).click();
        await expect(inner.nth(i)).toHaveAttribute('aria-selected', 'true');
        const panelId = await inner.nth(i).getAttribute('aria-controls');
        await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
      }

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  }

  test('announcement ticker: next / previous / pause', async ({ page }) => {
    const strip = xp(page, X.home.ticker);
    const counter = async () => ((await strip.innerText()).match(/(\d+)\s*\/\s*(\d+)/) || [])[0] ?? '';

    await expect(xp(page, X.home.tickerNext)).toBeVisible();
    await xp(page, X.home.tickerPause).click(); // stop auto-rotation so the test is deterministic

    const c1 = await counter();
    expect(c1, 'counter like 1/3').toMatch(/\d+\s*\/\s*\d+/);
    await xp(page, X.home.tickerNext).click();
    await expect.poll(counter).not.toBe(c1);
    await xp(page, X.home.tickerPrev).click();
    await expect.poll(counter).toBe(c1);

    await page.waitForTimeout(6000);
    expect(await counter(), 'paused ticker does not advance').toBe(c1);
  });

  test('announcement links resolve', async ({ page, request }) => {
    const hrefs = await xp(page, X.home.tickerLink).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      const res = await request.get(href, { failOnStatusCode: false });
      expect.soft(res.status(), `announcement ${href}`).toBeLessThan(400);
    }
  });

  test('Current Rates: every tab shows values', { tag: '@smoke' }, async ({ page }) => {
    await expect(xp(page, X.home.ratesHeading)).toHaveText(/Current Rates/);
    await expect(xp(page, X.home.policyRepoRate)).toBeVisible();
    await expect(xp(page, X.home.rateTabs)).toHaveCount(rateTabs.length);

    for (const id of rateTabs) {
      const tab = xp(page, X.home.rateTab(id));
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const panel = xp(page, X.home.ratePanel(id));
      await expect(panel).toBeVisible();
      await expect(panel, `${id} shows numbers`).toContainText(/\d/);
      await expect.soft(panel, `${id} has no placeholder values`).not.toContainText(/NaN|undefined|null|--%/);
    }
  });

  test('Policy Repo Rate is a valid percentage', async ({ page }) => {
    const text = await xp(page, X.home.ratePanel('policy-rates')).innerText();
    const m = text.match(/Policy Repo Rate\s*([\d.]+)\s*%/i);
    expect(m, 'repo rate value present').not.toBeNull();
    const v = Number(m![1]);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(20);
  });

  test('Latest Updates tabs switch content', { tag: '@smoke' }, async ({ page }) => {
    const whatsNew = xp(page, X.home.whatsNewTab);
    const today = xp(page, X.home.updatedTodayTab);
    await expect(whatsNew).toHaveAttribute('aria-selected', 'true');
    await expect(xp(page, X.home.whatsNewPanel)).toBeVisible();

    await today.click();
    await expect(today).toHaveAttribute('aria-selected', 'true');
    await expect(xp(page, X.home.updatedTodayPanel)).toBeVisible();

    await whatsNew.click();
    await expect(whatsNew).toHaveAttribute('aria-selected', 'true');
    await expect(xp(page, X.home.whatsNewPanel)).toBeVisible();
  });

  test("What's New items have a date and open a detail page", async ({ page }) => {
    const panel = xp(page, X.home.whatsNewPanel);
    await expect(panel).toContainText(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/);
    const first = xp(page, X.home.whatsNewItems).first();
    const href = (await first.getAttribute('href'))!;
    await first.click();
    await page.waitForLoadState('domcontentloaded');
    expect(new URL(page.url()).pathname).toBe(new URL(href, page.url()).pathname);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('all What\'s New links resolve', async ({ page, request }) => {
    const hrefs = await xp(page, X.home.whatsNewItems).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
    for (const href of new Set(hrefs)) {
      const res = await request.get(href, { failOnStatusCode: false });
      expect.soft(res.status(), href).toBeLessThan(400);
    }
  });

  test("Governor's Desk section renders", async ({ page }) => {
    await expect(xp(page, X.home.governorHeading)).toBeVisible();
  });

  test('footer is present with links', { tag: '@smoke' }, async ({ page }) => {
    const footer = xp(page, X.footer.root);
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
    expect(await xp(page, X.footer.links).count()).toBeGreaterThan(5);
  });

  test('external footer links open safely in a new tab', async ({ page }) => {
    const links = await xp(page, X.footer.externalLinks).evaluateAll((els) =>
      els.map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
    );
    const origin = new URL(page.url()).origin;
    const unsafe = links
      .filter((l) => l.href && new URL(l.href).origin !== origin)
      .filter((l) => l.target !== '_blank' || !/noopener|noreferrer/.test(l.rel || ''))
      .map((l) => `${l.href} target=${l.target} rel=${l.rel}`);
    expect.soft(unsafe, 'external links should use target=_blank rel=noopener').toEqual([]);
  });
});
