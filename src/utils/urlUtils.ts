import { config } from '../config';

/** Base URL of the site under test (BASE_URL in .env), without a trailing slash. */
export const baseURL = config.baseURL;
export const baseOrigin = new URL(config.baseURL).origin;

/** Absolute URL for a site path: urlFor('/press-releases') → https://stg-rbi.webc.in/press-releases */
export const urlFor = (path = '/') => new URL(path, `${baseURL}/`).toString();

/** True when the href points at the site under test (relative hrefs count as internal). */
export function isInternal(href: string): boolean {
  try {
    return new URL(href, `${baseURL}/`).origin === baseOrigin;
  } catch {
    return false;
  }
}

/** Pathname of an href, relative to the base URL. */
export function pathOf(href: string): string {
  return new URL(href, `${baseURL}/`).pathname;
}

/** Links that can never be navigated to: empty, "#", javascript:, or only a hash. */
export const isDeadHref = (href: string | null | undefined) => !href || /^(#|javascript:)/i.test(href.trim());

/** Host name without "www." — handy for matching social profiles. */
export const hostOf = (href: string) => {
  try {
    return new URL(href, `${baseURL}/`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
