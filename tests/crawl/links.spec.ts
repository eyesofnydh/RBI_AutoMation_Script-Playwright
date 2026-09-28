import { test, expect } from '@playwright/test';
import { crawledLinks, chunk } from '../../src/data';

/**
 * Verifies every unique link found during the crawl (internal pages, documents like PDFs,
 * and external sites) returns < 400. Links are grouped 40 per test so they run in parallel.
 * Requires `npm run crawl` first.
 */
test.describe.configure({ mode: 'parallel' });

const links = crawledLinks();
const batches = chunk(links, 40);

if (!links.length) {
  test('links (no crawl data)', { tag: '@links' }, async () => {
    test.skip(true, 'No crawl data — run `npm run crawl` (or `npm run test:full`) first.');
  });
}

batches.forEach((batch, i) => {
  test(`links batch ${i + 1}/${batches.length}`, { tag: '@links' }, async ({ request }) => {
    const broken: string[] = [];
    await Promise.all(
      batch.map(async (link) => {
        let status = 0;
        let error = '';
        try {
          // HEAD first; some servers don't support it, so fall back to GET.
          let res = await request.head(link.url, { timeout: 30_000, maxRedirects: 10, failOnStatusCode: false });
          if ([403, 405, 501].includes(res.status())) {
            res = await request.get(link.url, { timeout: 30_000, maxRedirects: 10, failOnStatusCode: false });
          }
          status = res.status();
        } catch (e) {
          error = String(e).split('\n')[0];
        }
        // External sites often block bots with 403/429 — report those only as warnings.
        const hardFail = status === 0 || status === 404 || status === 410 || status >= 500 || (link.kind !== 'external' && status >= 400);
        if (hardFail) broken.push(`${status || 'ERR'} [${link.kind}] ${link.url}\n      found on: ${link.foundOn.join(', ')}${error ? `\n      ${error}` : ''}`);
        else if (status >= 400) test.info().annotations.push({ type: 'warning', description: `${status} ${link.url}` });
      }),
    );
    expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([]);
  });
});
