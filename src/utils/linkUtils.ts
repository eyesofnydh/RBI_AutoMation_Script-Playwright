import type { APIRequestContext, Locator } from '@playwright/test';
import { isDeadHref, isInternal } from './urlUtils';

export type LinkInfo = {
  text: string;
  href: string;
  /** Raw attribute value (before the browser resolved it) */
  rawHref: string;
  target: string | null;
  rel: string | null;
  ariaLabel: string | null;
  title: string | null;
  width: number;
  height: number;
  visible: boolean;
};

export type LinkStatus = { href: string; status: number; ok: boolean; error?: string };

/** Reads every link matched by a locator in one round trip. */
export async function collectLinks(links: Locator): Promise<LinkInfo[]> {
  return links.evaluateAll((els) =>
    els.map((el) => {
      const a = el as HTMLAnchorElement;
      const r = a.getBoundingClientRect();
      const s = getComputedStyle(a);
      return {
        text: (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim(),
        href: a.href,
        rawHref: a.getAttribute('href') ?? '',
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel'),
        ariaLabel: a.getAttribute('aria-label'),
        title: a.getAttribute('title'),
        width: Math.round(r.width),
        height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
      };
    }),
  );
}

/** Accessible name of a link: text, aria-label, title, or the alt of an image inside it. */
export const linkName = (l: LinkInfo) => l.text || l.ariaLabel || l.title || '';

/** Unique, navigable hrefs (drops "#", javascript:, mailto:, tel:). */
export function uniqueHrefs(links: LinkInfo[], filter: 'all' | 'internal' | 'external' = 'all'): string[] {
  const hrefs = links
    .filter((l) => !isDeadHref(l.rawHref) && /^https?:/i.test(l.href))
    .filter((l) => (filter === 'all' ? true : filter === 'internal' ? isInternal(l.href) : !isInternal(l.href)))
    .map((l) => l.href.split('#')[0]);
  return [...new Set(hrefs)];
}

/**
 * Checks hrefs with the test's API context (shares HTTP credentials with the browser).
 * Tries HEAD first and falls back to GET — many servers answer HEAD with 405/403.
 * Runs `concurrency` requests at a time to stay gentle on staging.
 */
export async function checkLinks(request: APIRequestContext, hrefs: string[], concurrency = 4): Promise<LinkStatus[]> {
  const results: LinkStatus[] = [];
  let i = 0;
  const worker = async () => {
    while (i < hrefs.length) {
      const href = hrefs[i++];
      results.push(await checkLink(request, href));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hrefs.length) }, worker));
  return hrefs.map((h) => results.find((r) => r.href === h)!);
}

export async function checkLink(request: APIRequestContext, href: string): Promise<LinkStatus> {
  try {
    let res = await request.head(href, { failOnStatusCode: false, timeout: 20_000, maxRedirects: 5 });
    if ([403, 405, 501].includes(res.status())) {
      res = await request.get(href, { failOnStatusCode: false, timeout: 30_000, maxRedirects: 5 });
    }
    return { href, status: res.status(), ok: res.status() < 400 };
  } catch (e) {
    return { href, status: 0, ok: false, error: (e as Error).message.split('\n')[0] };
  }
}
