import fs from 'fs';
import { cacheFiles, config, seedPaths } from './config';
import type { LinkRef } from './crawler';

const limit = <T>(arr: T[], n: number) => (n > 0 ? arr.slice(0, n) : arr);

/** Crawled page URLs as paths (falls back to seed paths when `npm run crawl` hasn't run). */
export function pagePaths(max = config.pageCheckLimit): string[] {
  let urls: string[] = [];
  if (fs.existsSync(cacheFiles.pages)) {
    urls = JSON.parse(fs.readFileSync(cacheFiles.pages, 'utf8'));
  }
  const paths = urls.length ? urls.map((u) => new URL(u).pathname) : seedPaths;
  return limit([...new Set(paths)], max);
}

export function crawledLinks(): LinkRef[] {
  if (!fs.existsSync(cacheFiles.links)) return [];
  const all: LinkRef[] = JSON.parse(fs.readFileSync(cacheFiles.links, 'utf8'));
  const filtered = config.checkExternalLinks ? all : all.filter((l) => l.kind !== 'external');
  return limit(filtered, config.linkCheckLimit);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
