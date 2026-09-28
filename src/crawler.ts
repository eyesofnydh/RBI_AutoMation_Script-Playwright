import fs from 'fs';
import { config, cacheFiles, documentExt, seedPaths } from './config';

export type CrawledPage = { url: string; status: number; depth: number; from?: string; ms: number; error?: string };
export type LinkRef = { url: string; foundOn: string[]; kind: 'internal' | 'document' | 'external' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const origin = new URL(config.baseURL).origin;

/** Normalise to origin + pathname (no query, no hash, no trailing slash except root). */
export function normalise(raw: string, base: string): string | null {
  try {
    const u = new URL(raw, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    u.search = '';
    let p = u.pathname.replace(/\/+$/, '');
    if (p === '') p = '/';
    return u.origin + p;
  } catch {
    return null;
  }
}

function isExcluded(url: string): boolean {
  const { pathname } = new URL(url);
  return config.crawlExclude.some((re) => re.test(pathname));
}

/** "/press-releases/some-slug-123" -> "/press-releases/*". Top-level pages have no key (never capped). */
function sectionKey(url: string): string | null {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  return '/' + segs.slice(0, -1).join('/') + '/*';
}

function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    out.push(href.replace(/&amp;/g, '&'));
  }
  return out;
}

function authHeader(): Record<string, string> {
  if (!config.httpUser) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${config.httpUser}:${config.httpPass}`).toString('base64') };
}

async function get(url: string): Promise<{ status: number; type: string; body: string; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'rbi-e2e-crawler/1.0 (+playwright)', ...authHeader() },
  });
  const type = res.headers.get('content-type') || '';
  const body = type.includes('html') || type.includes('xml') ? await res.text() : '';
  return { status: res.status, type, body, finalUrl: res.url };
}

async function sitemapUrls(): Promise<string[]> {
  const found = new Set<string>();
  const queue = [`${origin}/sitemap.xml`];
  const seen = new Set<string>();
  while (queue.length && seen.size < 50) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const { status, body } = await get(sm);
      if (status >= 400 || !body.includes('<')) continue;
      const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
      const isIndex = /<sitemapindex/i.test(body);
      for (const l of locs) {
        if (isIndex || /\.xml$/i.test(l)) queue.push(l);
        else {
          const n = normalise(l, origin);
          // sitemaps often list the production host; rewrite onto the host under test
          if (n) found.add(origin + new URL(n).pathname);
        }
      }
    } catch {
      /* no sitemap — fine */
    }
  }
  return [...found];
}

/**
 * Breadth-first crawl of every internal HTML page reachable from the seeds + sitemap.
 * Writes .cache/pages.json (pages to test) and .cache/links.json (every link to verify).
 */
export async function crawl(log: (s: string) => void = console.log) {
  fs.mkdirSync(config.cacheDir, { recursive: true });

  const queue: { url: string; depth: number; from?: string }[] = [];
  const queued = new Set<string>();
  const perSection = new Map<string, number>();
  let cappedBySection = 0;
  const enqueue = (url: string, depth: number, from?: string) => {
    if (queued.has(url) || isExcluded(url) || documentExt.test(new URL(url).pathname)) return;
    const key = sectionKey(url);
    if (key && depth > 0 && config.maxPerSection > 0) { // seeds (menu pages) are never capped
      const n = perSection.get(key) ?? 0;
      if (n >= config.maxPerSection) {
        cappedBySection++;
        return;
      }
      perSection.set(key, n + 1);
    }
    queued.add(url);
    queue.push({ url, depth, from });
  };

  for (const p of seedPaths) enqueue(origin + (p === '/' ? '/' : p), 0);
  if (config.useSitemap) {
    const sm = await sitemapUrls();
    log(sm.length ? `sitemap: ${sm.length} URLs` : 'sitemap: none found (/sitemap.xml missing) — discovering pages by following links');
    sm.forEach((u) => enqueue(u, 1, 'sitemap.xml'));
  }

  const pages: CrawledPage[] = [];
  const links = new Map<string, LinkRef>();
  const addLink = (url: string, foundOn: string) => {
    const u = new URL(url);
    const kind: LinkRef['kind'] =
      u.origin !== origin ? 'external' : documentExt.test(u.pathname) ? 'document' : 'internal';
    const key = kind === 'external' ? u.origin + u.pathname + u.search : url;
    const ref = links.get(key) ?? { url: key, foundOn: [], kind };
    if (ref.foundOn.length < 5 && !ref.foundOn.includes(foundOn)) ref.foundOn.push(foundOn);
    links.set(key, ref);
  };

  let active = 0;
  const worker = async () => {
    while (pages.length + active < config.maxPages) {
      const item = queue.shift();
      if (!item) {
        if (active === 0) return;
        await sleep(50);
        continue;
      }
      active++;
      const t0 = Date.now();
      try {
        const res = await get(item.url);
        const page: CrawledPage = { url: item.url, status: res.status, depth: item.depth, from: item.from, ms: Date.now() - t0 };
        pages.push(page);
        const finalOrigin = new URL(res.finalUrl).origin;
        if (res.status < 400 && res.type.includes('html') && finalOrigin === origin) {
          for (const href of extractHrefs(res.body)) {
            let abs: string;
            try {
              const full = new URL(href, res.finalUrl);
              if (!/^https?:$/.test(full.protocol)) continue;
              abs = full.origin === origin ? normalise(full.href, origin)! : full.href.split('#')[0];
            } catch {
              continue;
            }
            addLink(abs, item.url);
            if (new URL(abs).origin === origin) enqueue(abs, item.depth + 1, item.url);
          }
        }
        if (pages.length % 25 === 0) log(`crawled ${pages.length} | queue ${queue.length}`);
      } catch (e) {
        pages.push({ url: item.url, status: 0, depth: item.depth, from: item.from, ms: Date.now() - t0, error: String(e) });
      } finally {
        active--;
      }
      if (config.crawlDelayMs) await sleep(config.crawlDelayMs);
    }
  };

  await Promise.all(Array.from({ length: config.crawlConcurrency }, worker));

  const htmlPages = pages.filter((p) => p.status > 0 && p.status < 400).map((p) => p.url);
  const broken = pages.filter((p) => p.status === 0 || p.status >= 400);
  fs.writeFileSync(cacheFiles.pages, JSON.stringify(htmlPages, null, 2));
  fs.writeFileSync(cacheFiles.links, JSON.stringify([...links.values()], null, 2));
  fs.writeFileSync(
    cacheFiles.crawlReport,
    JSON.stringify({ crawledAt: new Date().toISOString(), baseURL: config.baseURL, total: pages.length, notCrawled: queue.length, cappedBySection, sections: Object.fromEntries(perSection), broken, pages }, null, 2),
  );
  log(`done: ${pages.length} pages crawled, ${broken.length} broken, ${links.size} unique links`);
  if (queue.length) log(`  ${queue.length} URLs left in queue — raise MAX_PAGES to cover them`);
  if (cappedBySection) log(`  ${cappedBySection} URLs skipped by MAX_PER_SECTION=${config.maxPerSection} — set MAX_PER_SECTION=0 to crawl every item`);
  return { pages, broken, links: [...links.values()] };
}
