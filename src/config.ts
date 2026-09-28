import 'dotenv/config';
import path from 'path';

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v));

export const config = {
  baseURL: (process.env.BASE_URL || 'https://stg-rbi.webc.in').replace(/\/$/, ''),
  httpUser: process.env.HTTP_USER || '',
  httpPass: process.env.HTTP_PASS || '',

  maxPages: num(process.env.MAX_PAGES, 2000),
  crawlConcurrency: num(process.env.CRAWL_CONCURRENCY, 6),
  crawlDelayMs: num(process.env.CRAWL_DELAY_MS, 100),
  crawlExclude: (process.env.CRAWL_EXCLUDE ?? '^/hi/,/logout,/print/')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(s)),
  useSitemap: bool(process.env.USE_SITEMAP, true),
  /**
   * Max pages crawled per URL "template" (e.g. /press-releases/* has ~60,000 items).
   * Detail pages of one template share the same layout, so a sample finds template bugs.
   * 0 = no cap (crawl literally everything — can take many hours).
   */
  maxPerSection: num(process.env.MAX_PER_SECTION, 100),

  pageCheckLimit: num(process.env.PAGE_CHECK_LIMIT, 0),
  a11yPageLimit: num(process.env.A11Y_PAGE_LIMIT, 200),
  linkCheckLimit: num(process.env.LINK_CHECK_LIMIT, 0),
  checkExternalLinks: bool(process.env.CHECK_EXTERNAL_LINKS, true),

  searchTerm: process.env.SEARCH_TERM || 'repo rate',

  /** Auto-click tester: pages to exercise (0 = every crawled page) and max elements clicked per page. */
  interactionPageLimit: num(process.env.INTERACTION_PAGE_LIMIT, 0),
  maxClicksPerPage: num(process.env.MAX_CLICKS_PER_PAGE, 80),

  cacheDir: path.resolve(__dirname, '..', '.cache'),
};

export const cacheFiles = {
  pages: path.join(config.cacheDir, 'pages.json'),
  links: path.join(config.cacheDir, 'links.json'),
  crawlReport: path.join(config.cacheDir, 'crawl-report.json'),
};

/**
 * Seed URLs taken from the site's header, mega-menu and footer.
 * The crawler starts from these (plus the sitemap) and follows every internal link.
 * They are also the fallback page list when no crawl has been run yet.
 */
export const seedPaths = [
  '/',
  '/press-releases',
  '/about-us',
  '/about-us/organisation',
  '/about-us/central-board',
  '/about-us/departments',
  '/about-us/offices',
  '/about-us/rbi-history',
  '/about-us/communication-policy',
  '/about-us/sources-of-information',
  '/about-us/media-kit',
  '/banker-to-banks/overview',
  '/consumer-education-and-protection-department/overview',
  '/issuer-of-currency/overview',
  '/banker-and-debt-manager-to-government/overview',
  '/enforcement-department/overview',
  '/external-investments-and-operations/overview',
  '/fintech/overview',
  '/financial-inclusion-and-development/overview',
  '/financial-markets/overview',
  '/financial-stability-unit/overview',
  '/foreign-exchange-management/overview',
  '/functions/international-relations',
  '/monetary-policy/overview',
  '/payment-and-settlement-systems/overview',
  '/regulation',
  '/research-and-data/overview',
  '/functions/supervision',
  '/notifications/master-directions',
  '/notifications/master-circulars',
  '/notifications/amendment-directions',
  '/notifications/index-to-rbi-circulars',
  '/notifications/standalone-circulars',
  '/notifications/circular-withdrawn',
  '/notifications/draft-notifications',
  '/notifications/draft-directions-re-wise',
  '/speech-and-media',
  '/speech-and-media/media-interactions',
  '/speech-and-media/podcasts',
  '/speech-and-media/memorial-lectures',
  '/legal-framework/act',
  '/legal-framework/rules',
  '/legal-framework/regulations',
  '/legal-framework/schemes',
  '/issuer-of-currency/mani',
  '/complaints',
  '/citizens-charter',
  '/regulated-entities',
  '/faqs',
  '/right-to-information-act',
  '/publications/biennial',
  '/publications/annual',
  '/publications/half-yearly',
  '/publications/quarterly',
  '/publications/bi-monthly',
  '/publications/monthly',
  '/publications/weekly',
  '/publications/occasional',
  '/publications/reports',
  '/publications/working-papers',
  '/external-research-schemes',
  '/statistics/public-debt-statistics',
];

/** Listing pages that should show a list of items linking to detail pages. */
export const listingPaths = [
  '/press-releases',
  '/notifications/master-directions',
  '/notifications/master-circulars',
  '/notifications/amendment-directions',
  '/notifications/standalone-circulars',
  '/notifications/circular-withdrawn',
  '/notifications/draft-notifications',
  '/notifications/draft-directions-re-wise',
  '/faqs',
  '/speech-and-media/media-interactions',
  '/speech-and-media/podcasts',
  '/publications/working-papers',
];

/** Console messages that are known noise and should not fail a page. */
export const consoleAllowlist: RegExp[] = [
  /favicon/i,
  /google-analytics|googletagmanager|gtag/i,
  /Download the React DevTools/i,
  /\[HMR\]|\[vite\]/i,
];

/** File extensions treated as documents: link-checked, never crawled as HTML. */
export const documentExt = /\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar|xml|txt|jpe?g|png|gif|svg|webp|mp3|mp4)$/i;
