import { test, expect, gotoAndSettle } from '../../src/fixtures';
import { SiteHeader, presentationState } from '../../src/pages/SiteHeader';
import { X, xp } from '../../src/locators/xpath';

test.describe('Accessibility toolbar', { tag: '@functional' }, () => {
  test.beforeEach(async ({ page }) => {
    await gotoAndSettle(page, '/');
  });

  test('opens as a dialog with all 10 tools and closes', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.accessibilityBtn.click();
    await expect(header.accessibilityBtn).toHaveAttribute('aria-expanded', 'true');
    const panel = xp(page, X.a11yPanel.root);
    await expect(panel).toBeVisible();
    for (const name of X.a11yPanel.tileNames) {
      await expect(xp(page, X.a11yPanel.tile(name)), name).toBeVisible();
    }
    await expect(xp(page, X.a11yPanel.resetAll)).toBeVisible();

    await xp(page, X.a11yPanel.close).click();
    await expect(panel).toBeHidden();
  });

  test('Escape closes the panel and focus returns to the trigger', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.accessibilityBtn.click();
    await expect(xp(page, X.a11yPanel.root)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.soft(xp(page, X.a11yPanel.root)).toBeHidden();
    await expect.soft(header.accessibilityBtn).toBeFocused();
  });

  const toggles = ['Dark', 'Increase Text', 'Decrease Text', 'Text Spacing', 'Line Height', 'Hide Images', 'Big Cursor'];
  for (const name of toggles) {
    test(`"${name}" changes the page and Reset All restores it`, async ({ page, issues }) => {
      const header = new SiteHeader(page);
      await header.accessibilityBtn.click();
      await expect(xp(page, X.a11yPanel.root)).toBeVisible();
      const original = await presentationState(page);

      const tile = xp(page, X.a11yPanel.tile(name));
      await tile.click();
      await expect.poll(() => presentationState(page), { message: `${name} changes presentation` }).not.toBe(original);
      const pressed = await tile.getAttribute('aria-pressed');
      if (pressed !== null) expect.soft(pressed, 'toggle exposes pressed state').toBe('true');

      await xp(page, X.a11yPanel.resetAll).click();
      await expect.poll(() => presentationState(page), { message: 'Reset All restores original' }).toBe(original);
      expect(issues.pageErrors).toEqual([]);
    });
  }

  test('Increase Text twice then Reset Text returns to default size', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.accessibilityBtn.click();
    const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    const base = await size();
    await xp(page, X.a11yPanel.tile('Increase Text')).click();
    await xp(page, X.a11yPanel.tile('Increase Text')).click();
    await expect.poll(size).toBeGreaterThan(base);
    await xp(page, X.a11yPanel.tile('Reset Text')).click();
    await expect.poll(size).toBe(base);
  });

  test('Light/Dark are mutually exclusive', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.accessibilityBtn.click();
    const light = xp(page, X.a11yPanel.tile('Light'));
    const dark = xp(page, X.a11yPanel.tile('Dark'));
    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await dark.click();
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');
    await light.click();
    await expect(light).toHaveAttribute('aria-pressed', 'true');
  });

  test('settings persist across navigation', async ({ page }) => {
    const header = new SiteHeader(page);
    await header.accessibilityBtn.click();
    await xp(page, X.a11yPanel.tile('Dark')).click();
    await gotoAndSettle(page, '/press-releases');
    await expect(page.locator('body'), 'dark mode kept after navigation').toHaveClass(/a11y-dark/);
    // clean up
    await new SiteHeader(page).accessibilityBtn.click();
    await xp(page, X.a11yPanel.resetAll).click();
  });
});

test.describe('Language switch', { tag: '@functional' }, () => {
  // NOTE (checked on staging): the "Change language" button currently has no handler — nothing opens
  // and /hi routes return 404. These tests will fail until Hindi is implemented; that is intentional.
  test('language button opens a language choice', async ({ page }) => {
    await gotoAndSettle(page, '/');
    const header = new SiteHeader(page);
    await header.languageBtn.click();
    const hindi = page.getByText(/हिन्दी|हिंदी|hindi/i).filter({ visible: true }).first();
    await expect(hindi, 'Hindi option appears after clicking Change language').toBeVisible({ timeout: 5000 });
  });

  test('switching to Hindi translates the page and English restores it', async ({ page }) => {
    await gotoAndSettle(page, '/');
    const header = new SiteHeader(page);
    await header.languageBtn.click();
    await page.getByText(/हिन्दी|हिंदी|hindi/i).filter({ visible: true }).first().click({ timeout: 5000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect
      .poll(async () => {
        const lang = await page.evaluate(() => document.documentElement.lang);
        const devanagari = await page.evaluate(() => (document.body.innerText.match(/[ऀ-ॿ]/g) || []).length);
        return lang.startsWith('hi') || /\/hi(\/|$)/.test(page.url()) || devanagari > 200;
      })
      .toBe(true);

    await new SiteHeader(page).languageBtn.click();
    await page.getByText(/english|अंग्रेज़ी|अंग्रेजी/i).filter({ visible: true }).first().click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toMatch(/^en/);
  });
});
