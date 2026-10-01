# RBI website — E2E test suite

Playwright + TypeScript automation for **https://stg-rbi.webc.in**: a full-site crawl with per-page health checks, link checking, accessibility scans, and functional journeys on desktop and mobile. Every run produces both Playwright HTML and Allure results.

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
| `npm run report` | Open the HTML report (screenshots, video and trace on failures) |
| `npm run report:allure` | Generate the Allure dashboard from the latest results |
| `npm run report:allure:open` | Open the generated Allure dashboard |
| `npm run report:allure:serve` | Generate and serve Allure in one command |
| `npm run report:clean` | Remove old Playwright and Allure report output |

Target a different environment: `BASE_URL=https://www.rbi.org.in npm run test:functional`

Filter by tag: `npx playwright test --grep @functional`, `@pages`, `@links`, `@a11y`.

Fast critical-path check: `npx playwright test --grep @smoke` (24 desktop/mobile checks).

## Reports

- **Allure** is the primary dashboard. It groups results by suite and browser, shows retries/history-ready metadata, and includes Playwright steps plus JSON issue attachments.
- **Playwright HTML** remains available because its trace viewer is the fastest way to debug a failed browser step.
- In GitHub Actions, download `allure-report-<run number>` or `playwright-report-<run number>` from the run's **Artifacts** section and open `index.html`.
- Run `npm run report:clean` before a fresh local execution when you do not want Allure to include results from earlier runs.

Allure report generation requires Java. CI installs Java automatically; for local use install Java 17 or newer.

## GitHub Actions

Pushes and pull requests run the 24-check `@smoke` suite. The nightly schedule and a manual run with **coverage = full** execute all functional scenarios and a much larger page/link/accessibility/interaction audit. Chromium is cached between runs.

The workflow intentionally runs crawl, tests, Playwright HTML generation, and Allure generation in one job. This removes cross-job artifact downloads, blob reports, and `playwright merge-reports`. If tests fail, both reports are generated and uploaded first; the final step then gives the workflow the correct failed status.

Site defects still make the test job red by design. Infrastructure errors (for example missing crawl data) fail earlier with an explicit artifact error, so they are not confused with product failures.

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
tests/
  crawl/             pages / links / a11y (data-driven from the crawl)
  crawl/interactions.spec.ts  auto-click tester (every control on every page)
  functional/        header, search, accessibility-language, homepage, listings, templates, responsive, xpath-locators
run.ps1 / run.bat    Windows runner with a menu
.github/workflows/e2e.yml   smoke/full CI with direct Playwright + Allure reports
```

## Tuning

- **Known noise** in console: add regexes to `consoleAllowlist` in `src/config.ts`.
- **Skip sections** (e.g. Hindi duplicates, archives): `CRAWL_EXCLUDE=^/hi/,^/archive/`.
- **Be gentle with staging**: lower `CRAWL_CONCURRENCY` / raise `CRAWL_DELAY_MS`, and use `--workers=2`.
- **Soft vs hard failures**: page specs use `expect.soft` so one run lists every problem on a page; only HTTP errors, uncaught JS exceptions and a missing title stop a test immediately.

