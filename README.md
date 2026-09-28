# RBI website — E2E test suite

Playwright + TypeScript automation for **https://stg-rbi.webc.in**: a full-site crawl with per-page health checks, link checking, accessibility scans, and functional journeys on desktop and mobile.

## Quick start (Windows)

Double-click **`run.bat`**, or in the VS Code terminal:

```powershell
.\run.ps1 setup        # first time only: installs packages + Chromium, creates .env
.\run.ps1 full         # crawl the whole site and run every test
.\run.ps1              # menu with all options
```

If PowerShell says scripts are disabled: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (once).
Windows PowerShell 5 does not accept `&&` — run commands one per line, or use `run.ps1`.

## Setup (any OS)

```bash
npm install
npx playwright install chromium
cp .env.example .env      # Windows: Copy-Item .env.example .env
```

## Run


| `npm run test:full` | Crawl the whole site, then run everything |
| `npm run crawl` | Discover every internal page (seeds + sitemap + link-following) → `.cache/` |
| `npm run test:pages` | One test per crawled page: status, JS errors, console errors, failed requests, broken images, h1, template leaks, overflow, SEO basics |
| `npm run test:links` | Every unique link found (pages, PDFs, external) returns < 400 |
| `npm run test:a11y` | axe-core WCAG 2.1 AA scan per page (fails on serious/critical) |
| `npm run test:interactions` | **Auto-click tester**: on every crawled page clicks every button, tab, accordion, dropdown and checkbox, and types edge-case data (long, special chars, XSS, SQL-like, Hindi/emoji) into every input. Fails on JS errors, clicks leading to 404/500, covered buttons, script execution; warns on dead buttons |
| `npm run test:functional` | Header/nav, mega-menu, search, accessibility toolbar, Hindi/English switch, homepage widgets, listings, filters, pagination, detail pages, 404, responsive |
| `npm run test:mobile` | Functional suite on Pixel 7 emulation |
| `npm run test:locators` | Checks every XPath in `src/locators/xpath.ts` still matches the live site |
| `npm run test:headed` | Watch it run in a real browser |
| `npm run test:footer` | Footer: Quick Links / Need Help links resolve, social profiles (new tab + rel=noopener), link names, copyright year, same footer on other pages, mobile stacking + tap targets |
| `npm run test:maximized` | Functional suite in a visible, maximised browser window |
| `npm run report` | Open the HTML report (screenshots, video and trace on failures) |
| `npm run report:extent` | Open the Extent-style report (`extent-report/index.html`) |

Target a different environment: `BASE_URL=https://www.rbi.org.in npm run test:functional`

Filter by tag: `npx playwright test --grep @functional`, `@pages`, `@links`, `@a11y`.

## Test cases

`RBI-Test-Cases.xlsx` (delivered alongside this project) lists every manual + automated test case: module, steps, test data, expected result, priority, type (Functional / UI / Edge / Negative / Accessibility / Security / Performance / SEO / Compatibility), and which spec automates it. Fill in Status / Actual Result during manual runs; the Summary sheet updates itself.

## XPath locators

All element locators live in **`src/locators/xpath.ts`**, taken from the live DOM (stable ids such as
`#site-search-input`, `#nav-trigger-about-rbi`, `#rate-tab-policy-rates`, `#pr-year`). Use them in any test:

```ts
import { X, xp, xpVisible } from '../../src/locators/xpath';
await xp(page, X.header.menuBtn).click();
await xp(page, X.home.rateTab('reserve-ratios')).click();
await xpVisible(page, X.listing.pagerNext).click();   // first visible match
```

After a deploy, run `npm run test:locators` first: it lists any XPath that no longer matches, so you fix one line instead of chasing many failures.

### Relative XPaths (footer)

The footer root uses an absolute XPath; everything inside it uses **relative XPaths** (starting with `.`) from
`X.footer.rel`, resolved inside the root, so a "Forms" link in the page body is never mistaken for the footer one.
They use XPath axes rather than CSS classes, so they survive markup changes:

| Locator | Technique |
|---|---|
| `rel.heading('Quick Links')` | case-insensitive exact text via `translate()`, deepest match via `not(.//*[…])` |
| `rel.section(title)` / `rel.sectionLinks(title)` | `ancestor::*[.//a[@href]][1]` — nearest ancestor that holds links = that column |
| `rel.linksAfterHeading(title)` | `following::a` axis |
| `rel.headingOfLink(label)` | `preceding::*[self::h2 or …][1]` — closest heading before a link |
| `rel.social('youtube')` | `contains(@href, …)` on the host, so icon-only links match |
| `rel.unnamedLinks`, `rel.deadLinks`, `rel.unsafeBlankLinks` | predicates that should match nothing (accessibility / security checks) |
| `rel.nthListItemLinks(n)`, `rel.lastLink` | positional predicates, `last()` |

```ts
const footer = new SiteFooter(page);                     // or the `footer` fixture
await footer.sectionLinks('Quick Links').count();
await footer.rel(X.footer.rel.linksAfterHeading('Need Help')).first().click();
await xp(xp(page, X.footer.root), X.footer.rel.copyright).innerText();
```

> The footer locators were written from the test cases (Quick Links, Need Help, social icons, copyright) — run
> `npm run test:locators` against staging once and adjust any that report no match.

## Soft assertions & utilities (`src/utils`)

**`SoftAssert`** works like TestNG's: every check runs, failures are collected, `assertAll()` throws one error listing all of them.
Each check is logged (pass/fail) to the Extent report and the first failure attaches a screenshot.

```ts
import { test } from '../../src/fixtures';

test('footer', async ({ footer, soft }) => {          // `soft` calls assertAll() when the test ends
  await soft.visible(footer.quickLinksHeading, 'Quick Links heading');
  await soft.countAtLeast(footer.socialLinks, 1, 'social links present');
  await soft.equals(await footer.copyrightYears(), [2026], 'copyright year');
});

// or by hand
const soft = new SoftAssert(page);
await soft.attribute(link, 'target', '_blank', 'opens in new tab');
soft.assertAll();
```

Checks: `equals`, `notEquals`, `isTrue`, `isFalse`, `contains`, `matches`, `greaterThan`, `lessThan`, `isEmpty`,
`visible`, `hidden`, `count`, `countAtLeast`, `text`, `containsText`, `attribute`, `url`, and `check(msg, fn)` for anything else.
`softly(page, 'title', async soft => …)` wraps a block in a step and asserts at the end of it.

| Module | Helpers |
|---|---|
| `reportLogger.ts` | `log.info / pass / warning / fail / skip`, `log.screenshot(page)`, `log.data(name, obj)` — Extent log entries |
| `linkUtils.ts` | `collectLinks(locator)` (text, href, target, rel, size in one call), `uniqueHrefs`, `checkLinks(request, hrefs)` (HEAD→GET fallback, limited concurrency), `linkName` |
| `urlUtils.ts` | `baseURL`, `urlFor(path)`, `isInternal`, `pathOf`, `hostOf`, `isDeadHref` |
| `elementUtils.ts` | `scrollTo`, `scrollToBottom`, `cleanText`, `allTexts`, `isInViewport`, `boxes`, `overflowsViewport`, `highlight`, `clickAndGetPopup` |

## Base URL and maximised browser

- **Base URL** comes from `BASE_URL` in `.env` (default `https://stg-rbi.webc.in`); tests use relative paths (`page.goto('/faqs')`).
  In code: `import { baseURL, urlFor } from '../../src/utils'`.
- **Maximised window**: `--headed` runs open maximised automatically (`viewport: null` + `--start-maximized`).
  Force it with `MAXIMIZE=true` (headless uses `WINDOW_SIZE`, default `1920,1080`) or turn it off with `MAXIMIZE=false`
  to get the fixed 1440×900 viewport. Mobile runs always use Pixel 7 emulation.

## Extent report

Every run also writes **`extent-report/index.html`**, a report laid out like AventStack ExtentReports (Spark).
ExtentReports itself is a Java/.NET library, so this is a Playwright reporter (`src/reporters/extent-reporter.ts`) that
produces the same views:

- **Dashboard**: pass/fail/skip/flaky counts, pass-rate and log-event charts, run times, system/environment info
  (base URL, browser window, Playwright, Node, OS, workers), and per-category / device / spec summaries
- **Tests**: searchable, filterable list; per test the step log (status, time, details) combining `test.step`, `expect`,
  `log.*` and SoftAssert entries, errors with code snippet, screenshots (click to enlarge), video/trace links, retries
- **Categories** (test tags such as `@footer`), **Devices** (projects), **Exceptions** (failures grouped by error)
- Light/dark theme; the folder is self-contained (screenshots, videos and traces are copied into `extent-report/assets/`)

Title and folder: `REPORT_TITLE`, `REPORT_DIR` in `.env`. In CI the sharded runs are merged into one Extent report
(`merge.config.ts`) and uploaded as the `extent-report` artifact.

## Known issues found on staging (27 Sep 2026 live check — tests fail on purpose until fixed)

Broken links (404), present on every page because they sit in the menu/footer:

| Broken URL | Link text | Where |
|---|---|---|
| `/regulation` | Regulation | Header → Functions mega-menu |
| `/opportunities` | Opportunities | Footer |
| `/important-websites` | Important Websites | Footer |
| `/bank-holidays` | Bank Holidays | Footer |
| `/rbi-clarifications` | RBI Clarifications | Footer |
| `/forms` | Forms | Footer |
| `/about-rbi/vision-and-values` | RBI's Vision and Values | Footer |
| `/about-us/rbi-museum` | RBI Museum | Site-wide link |
| `/governor-monetary-policy-statements` | Monetary Policy Statements, Governor | Homepage — Governor's Desk |

Other:
- **Soft 404**: `/speech-and-media` returns HTTP 200 but shows the "not found" page.
- **Language switch**: the "Change language" button does nothing and `/hi` returns 404.
- **Announcement ticker**: "Previous announcement" did not move back in the live check (Next works) — confirm by hand.
- **SEO**: `/sitemap.xml` and `/robots.txt` return 404 (the crawler falls back to following links).
- **Slow pages** (3–4 s HTML response under load): notifications listings, speech-and-media sub-pages.

## How the full crawl works

1. Starts from every URL in the header/mega-menu/footer (`src/config.ts → seedPaths`) plus `/sitemap.xml`.
2. Fetches each page over HTTP and follows every same-origin `<a href>` (query strings and `#hash` stripped; PDFs/images recorded as documents, not crawled).
3. Samples at most `MAX_PER_SECTION` (default 100) pages per URL template, e.g. `/press-releases/*` has ~60,000 items that share one layout. Menu pages are never capped. Set `MAX_PER_SECTION=0` to crawl literally everything (many hours).
4. Stops at `MAX_PAGES` (default 2000). The crawl log tells you how many URLs were left or skipped.
5. Writes `.cache/pages.json`, `.cache/links.json` and `.cache/crawl-report.json` (includes pages that returned 4xx/5xx and where they were linked from).

The page/link/a11y specs generate one test per URL from those files. Without a crawl they fall back to the seed list.

## Project layout

```
src/
  config.ts          env settings, seed URLs, listing URLs, console allowlist
  crawler.ts         site crawler
  fixtures.ts        `issues` fixture (console/JS/network errors), navigation helpers
  locators/xpath.ts  every XPath locator, grouped by page
  pages/SiteHeader.ts  header page object (uses the XPaths)
  pages/SiteFooter.ts  footer page object (relative XPaths inside the footer root)
  utils/             SoftAssert, report logger, link / URL / element helpers
  reporters/         Extent-style HTML reporter (extent-reporter.ts + extent/ css & js)
tests/
  crawl/             pages / links / a11y (data-driven from the crawl)
  crawl/interactions.spec.ts  auto-click tester (every control on every page)
  functional/        header, footer, search, accessibility-language, homepage, listings, templates, responsive, xpath-locators
run.ps1 / run.bat    Windows runner with a menu
.github/workflows/e2e.yml   nightly + on-demand CI, 4 shards, merged HTML report
```

## Tuning

- **Known noise** in console: add regexes to `consoleAllowlist` in `src/config.ts`.
- **Skip sections** (e.g. Hindi duplicates, archives): `CRAWL_EXCLUDE=^/hi/,^/archive/`.
- **Be gentle with staging**: lower `CRAWL_CONCURRENCY` / raise `CRAWL_DELAY_MS`, and use `--workers=2`.
- **Soft vs hard failures**: page specs use `expect.soft` so one run lists every problem on a page; only HTTP errors, uncaught JS exceptions and a missing title stop a test immediately.

