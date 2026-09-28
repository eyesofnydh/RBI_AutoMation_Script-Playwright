import type { Locator, Page } from '@playwright/test';

/** Scrolls an element into view and waits for lazy content in it to render. */
export async function scrollTo(locator: Locator, settleMs = 300) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForTimeout(settleMs);
}

/** Scrolls to the very bottom of the page (where the footer lives). */
export async function scrollToBottom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
}

/** Visible text of an element with whitespace collapsed ('' when it does not exist). */
export async function cleanText(locator: Locator): Promise<string> {
  if (!(await locator.count())) return '';
  return ((await locator.first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
}

/** Texts of every element matched, whitespace collapsed, empty ones dropped. */
export async function allTexts(locator: Locator): Promise<string[]> {
  return (await locator.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** True when the element is currently inside the viewport. */
export async function isInViewport(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
  });
}

/** Left/top offsets of every matched element — used to tell side-by-side columns from stacked ones. */
export async function boxes(locator: Locator) {
  return locator.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
}

/** True when the element (or its content) overflows the viewport horizontally. */
export async function overflowsViewport(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1);
}

/** Outline an element (for headed debugging and screenshots). */
export async function highlight(locator: Locator, color = '#e11d48') {
  await locator.evaluate((el, c) => {
    (el as HTMLElement).style.outline = `3px solid ${c}`;
    (el as HTMLElement).style.outlineOffset = '2px';
  }, color);
}

/** Opens a link that uses target=_blank and returns the new tab (closed by the caller). */
export async function clickAndGetPopup(page: Page, link: Locator): Promise<Page> {
  const [popup] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  return popup;
}
