/**
 * XPath locators for stg-rbi.webc.in, taken from the live DOM (Angular SSR build).
 *
 * Use in Playwright with the `xpath=` prefix, e.g.
 *   page.locator(`xpath=${X.header.searchInput}`)
 * or via the helper at the bottom:  xp(page, X.header.searchInput)
 *
 * `tests/functional/xpath-locators.spec.ts` checks every entry still matches the site,
 * so a markup change shows up as one clear failing locator instead of many broken tests.
 *
 * Helpers used below:
 *   hasClass('x')  -> matches an element whose class list contains exactly "x"
 */
import type { Page, Locator } from '@playwright/test';

const hasClass = (c: string) => `contains(concat(' ', normalize-space(@class), ' '), ' ${c} ')`;
const text = (t: string) => `normalize-space()='${t}'`;
/** XPath 1.0 has no lower-case(): translate() A-Z to a-z instead. */
const lower = (expr: string) => `translate(${expr}, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')`;
/** Case-insensitive exact text match. */
const ciText = (t: string) => `${lower('normalize-space()')}='${t.toLowerCase()}'`;

export type SocialNetwork = 'youtube' | 'x' | 'instagram' | 'facebook' | 'linkedin';
const socialHosts: Record<SocialNetwork, string[]> = {
  youtube: ['youtube.com', 'youtu.be'],
  x: ['twitter.com', '//x.com', 'www.x.com'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  linkedin: ['linkedin.com'],
};
const socialHostsAll = () => Object.values(socialHosts).flat();
/** Relative: deepest element (not a link) whose text is exactly `title`, case-insensitive. */
const headingRel = (title: string) => `.//*[${ciText(title)}][not(.//*[${ciText(title)}])][not(self::a)]`;

export const X = {
  header: {
    root: `//header[.//a[${hasClass('brand')}]]`,
    logo: `//header//a[${hasClass('brand')} and @href='/']`,
    aboutRbiTrigger: `//button[@id='nav-trigger-about-rbi']`,
    aboutRbiPanel: `//div[@id='nav-panel-about-rbi']`,
    functionsTrigger: `//button[@id='nav-trigger-functions']`,
    functionsPanel: `//div[@id='nav-panel-functions']`,
    pressReleasesLink: `//header//a[${hasClass('primary-nav__link')} and @href='/press-releases']`,
    searchForm: `//form[@role='search' and .//input[@id='site-search-input']]`,
    searchInput: `//input[@id='site-search-input']`,
    searchSubmit: `//header//button[${hasClass('site-search__submit')} and @aria-label='Search' and not(ancestor::*[@id='site-navmenu'])]`,
    accessibilityBtn: `//button[@id='masthead-a11y-trigger']`,
    languageBtn: `//header//button[@aria-label='Change language' and not(ancestor::*[@id='site-navmenu'])]`,
    skipToMain: `//header//button[@aria-label='Skip to main content' and not(ancestor::*[@id='site-navmenu'])]`,
    menuBtn: `//button[@id='masthead-menu-trigger']`,
  },

  navMenu: {
    root: `//*[@id='site-navmenu']`,
    searchInput: `//input[@id='navmenu-search-input']`,
    languageBtn: `//*[@id='site-navmenu']//button[@aria-label='Change language']`,
    links: `//*[@id='site-navmenu']//a[@href]`,
  },

  a11yPanel: {
    root: `//div[@id='a11y-panel' and @role='dialog']`,
    close: `//button[@id='a11y-close']`,
    tiles: `//div[@id='a11y-panel']//button[${hasClass('a11y__tile')}]`,
    tile: (name: string) => `//div[@id='a11y-panel']//button[${hasClass('a11y__tile')} and ${text(name)}]`,
    resetAll: `//div[@id='a11y-panel']//button[${hasClass('a11y__reset')}]`,
    /** Tile labels on the site, in order */
    tileNames: ['Light', 'Dark', 'Increase Text', 'Decrease Text', 'Reset Text', 'Text Spacing', 'Line Height', 'Hide Images', 'Big Cursor', 'Screen Reader'],
  },

  home: {
    srOnlyH1: `//h1[${hasClass('sr-only')}]`,
    heroText: `(//main//*[contains(normalize-space(), 'Continue excellence while enabling')][not(*[contains(normalize-space(), 'Continue excellence')])])[1]`,

    // Quick-access hub (Notifications / Citizen's Centre / Publications & Research / Speeches & Media)
    quickTab: (id: 'notifications' | 'citizen-s-centre' | 'research-publication' | 'speeches-and-media') =>
      `//button[@id='hub-trigger-${id}']`,
    quickPanel: (id: string) => `//*[@id='hub-panel-${id}']`,
    hubInnerTabs: (id: string) => `//button[${hasClass('hub-tab')} and starts-with(@id, 'hub-${id}-tab-')]`,

    // Announcement ticker
    ticker: `//app-announcement-strip`,
    tickerLink: `//app-announcement-strip//a[@href]`,
    tickerPrev: `//button[@aria-label='Previous announcement']`,
    tickerPause: `//button[@aria-label='Pause announcements' or @aria-label='Play announcements' or @aria-label='Resume announcements']`,
    tickerNext: `//button[@aria-label='Next announcement']`,

    // Current Rates
    ratesHeading: `//h2[@id='current-rates-heading']`,
    rateTabs: `//button[${hasClass('rate-tab')} and @role='tab']`,
    rateTab: (id: 'policy-rates' | 'reserve-ratios' | 'exchange-rates' | 'lending-deposit-rates' | 'market-trends') =>
      `//button[@id='rate-tab-${id}']`,
    ratePanel: (id: string) => `//div[@id='rate-panel-${id}']`,
    policyRepoRate: `//div[@id='rate-panel-policy-rates']//*[${text('Policy Repo Rate')}]`,

    // Governor's Desk
    governorHeading: `//h2[@id='governors-desk-heading']`,

    // Latest Updates
    updatesHeading: `//h2[@id='latest-updates-heading']`,
    whatsNewTab: `//button[@id='update-tab-whats-new']`,
    updatedTodayTab: `//button[@id='update-tab-sections-updated-today']`,
    whatsNewPanel: `//div[@id='update-panel-whats-new']`,
    /** Rendered only after the "Sections Updated Today" tab is clicked */
    updatedTodayPanel: `//div[@id='update-panel-sections-updated-today']`,
    whatsNewItems: `//div[@id='update-panel-whats-new']//a[@href]`,
  },

  listing: {
    // Shared by /press-releases and similar document listings
    title: `//h1[@id='doc-hero-title']`,
    breadcrumb: `//nav[@aria-label='Breadcrumb']`,
    breadcrumbHome: `//nav[@aria-label='Breadcrumb']//a[@href='/']`,
    cards: `//main//div[${hasClass('card')}]`,
    cardTitleLinks: `//main//a[${hasClass('card__title')}]`,
    functionFilterSearch: `//input[@id='pr-function-filter']`,
    functionCheckboxes: `//main//input[${hasClass('panel__check-input')}]`,
    functionCheckbox: (label: string) => `//main//input[${hasClass('panel__check-input')} and starts-with(@aria-label, '${label},')]`,
    yearSelect: `//button[@id='pr-year']`,
    /** Options exist in the DOM before the listbox opens; click yearSelect first to make them visible */
    yearOptions: `//*[@id='pr-year-list']//*[@role='option']`,
    monthSelect: `//button[@id='pr-month']`,
    monthOptions: `//*[@id='pr-month-list']//*[@role='option']`,
    keywordSearch: `//input[@id='pr-search']`,
    sortSelect: `//button[@id='pr-sort']`,
    pageSizeSelect: `//button[starts-with(@id, 'pager-size')]`,
    // The pager renders a full and a compact set of controls; use xpVisible() to pick the one on screen.
    pager: `//nav[@aria-label='Pagination']`,
    pagerPrev: `//nav[@aria-label='Pagination']//*[@aria-label='Previous page']`,
    pagerNext: `//nav[@aria-label='Pagination']//*[@aria-label='Next page']`,
    pagerPage: (n: number) => `//nav[@aria-label='Pagination']//a[@aria-label='Page ${n}']`,
  },

  detail: {
    title: `//h1[@id='doc-hero-title']`,
    breadcrumb: `//nav[@aria-label='Breadcrumb']`,
    date: `//main//time`,
    pdfLink: `//main//a[${hasClass('doc-hero__action')} and (contains(translate(@href, 'PDF', 'pdf'), '.pdf') or @download)]`,
    lastUpdated: `//main//*[${hasClass('release__foot')}]`,
  },

  search: {
    // /search?q=...
    title: `//h1[starts-with(normalize-space(), 'Search result for')]`,
    resultLinks: `//main//p[${hasClass('card__title')}]/a[${hasClass('card__link')}]`,
    // Filter panel button, e.g. "Show 28,842 results"
    resultCount: `//main//button[starts-with(normalize-space(), 'Show ') and contains(normalize-space(), ' result')]`,
    noResults: `//main//*[starts-with(normalize-space(), 'No results for')][not(*[starts-with(normalize-space(), 'No results for')])]`,
    clearAll: `//main//*[self::a or self::button][${text('Clear all')}]`,
    pager: `//nav[@aria-label='Pagination']`,
  },

  /** Shared filter panel used by Press Releases, Notifications, FAQs, Podcasts, Media Interactions, Working Papers */
  filters: {
    panelToggle: `//button[${hasClass('listing__filters-toggle')}]`,
    panelClose: `//button[${hasClass('panel__bar-close')}]`,
    functionSearch: `//input[@id='pr-function-filter']`,
    functionCheckboxes: `//main//input[${hasClass('panel__check-input')}]`,
    viewMore: `//button[${hasClass('panel__more')}]`,
    year: `//*[@id='pr-year']`,
    month: `//*[@id='pr-month']`,
    rangeToggle: `//button[${hasClass('panel__range-toggle')}]`,
    fromDate: `//*[@id='pr-from']`,
    toDate: `//*[@id='pr-to']`,
    applyRange: `//button[${hasClass('panel__apply')}]`,
    clearRange: `//button[${hasClass('panel__clear-range')}]`,
    showResults: `//button[${hasClass('panel__foot-apply')}]`,
    visibleOptions: `//*[@role='option']`,
  },

  /** Static content pages (e.g. /banker-to-banks/overview) — "On this page" index with its own search */
  staticPage: {
    indexToggle: `//button[${hasClass('index__toggle')}]`,
    indexSearch: `//input[starts-with(@id, 'page-index-') and contains(@id, '-query')]`,
    indexSubmit: `//button[${hasClass('index__submit')}]`,
    accordionToggles: `//main//button[@aria-expanded]`,
    sectionRailMore: `//button[@id='section-rail-more']`,
  },

  aboutUs: {
    prevBuilding: `//button[@aria-label='Previous building']`,
    nextBuilding: `//button[@aria-label='Next building']`,
    buildingDots: `//button[${hasClass('intro__dot')}]`,
    buildingPause: `//button[${hasClass('intro__toggle')}]`,
  },

  organisation: {
    chartToggles: `//button[${hasClass('chart__toggle')}]`,
  },

  offices: {
    mapTab: `//*[@id='offices-tab-map']`,
    listTab: `//*[@id='offices-tab-list']`,
    search: `//input[@id='offices-search']`,
    mapPins: `//button[${hasClass('map__pin')}]`,
    pin: (office: string) => `//button[${hasClass('map__pin')} and @aria-label='${office}']`,
  },

  departments: {
    search: `//input[@id='dept-search']`,
  },

  history: {
    sectionNavToggle: `//button[starts-with(@id, 'section-nav-toggle-')]`,
    galleryNext: `//button[@aria-label='Next photograph']`,
    galleryDots: `//button[${hasClass('hist-gallery__dot')}]`,
    volumeReadMore: `//button[${hasClass('vol__more')}]`,
    volumesNext: `//button[@aria-label='Next Volumes']`,
    volumesDots: `//button[${hasClass('vols__dot')}]`,
  },

  footer: {
    root: `(//footer[not(ancestor::main)])[last()]`,
    links: `(//footer[not(ancestor::main)])[last()]//a[@href]`,
    externalLinks: `(//footer[not(ancestor::main)])[last()]//a[starts-with(@href, 'http')]`,

    // ---- Relative XPaths: start with "." and are resolved inside the footer root ----
    // Use through SiteFooter, or xp(xp(page, X.footer.root), X.footer.rel.quickLinksHeading).
    rel: {
      /** Deepest element whose text is exactly the heading (e.g. "Quick Links"), whatever tag it uses. */
      heading: headingRel,
      /** Nearest ancestor of the heading that also holds links = that heading's column/section. */
      section: (title: string) =>
        `(${headingRel(title)})[1]/ancestor::*[.//a[@href]][1]`,
      /** Links of one section (column) of the footer. */
      sectionLinks: (title: string) =>
        `(${headingRel(title)})[1]/ancestor::*[.//a[@href]][1]//a[@href]`,
      /** Every footer link after the heading in document order (following axis). */
      linksAfterHeading: (title: string) =>
        `(${headingRel(title)})[1]/following::a[@href][ancestor::footer]`,
      quickLinksHeading: headingRel('Quick Links'),
      needHelpHeading: headingRel('Need Help'),
      /** Social profile link, matched on the host so icon-only links work. */
      social: (network: SocialNetwork) => `.//a[${socialHosts[network].map((h) => `contains(@href, '${h}')`).join(' or ')}]`,
      socialLinks: `.//a[${socialHostsAll().map((h) => `contains(@href, '${h}')`).join(' or ')}]`,
      /** A link by its visible text (exact, whitespace-normalised). */
      linkByText: (label: string) => `.//a[@href and ${text(label)}]`,
      /** Nearest heading before a given link (preceding axis is reverse, so [1] = closest). */
      headingOfLink: (label: string) =>
        `.//a[@href and ${text(label)}]/preceding::*[self::h2 or self::h3 or self::h4 or self::h5 or self::h6][1]`,
      copyright: `.//*[contains(normalize-space(), '©') or contains(${lower('normalize-space()')}, 'copyright')][not(*[contains(normalize-space(), '©') or contains(${lower('normalize-space()')}, 'copyright')])]`,
      lastUpdated: `.//*[contains(${lower('normalize-space()')}, 'last updated')][not(*[contains(${lower('normalize-space()')}, 'last updated')])]`,
      logo: `(.//a[.//img or .//*[local-name()='svg']][not(starts-with(@href, 'http')) or contains(@href, 'rbi.org.in')])[1]`,
      images: `.//img`,
      /** Links with no accessible name: no text, no aria-label, no title and no img alt. */
      unnamedLinks: `.//a[@href][not(normalize-space())][not(@aria-label) or @aria-label=''][not(@title)][not(.//img[@alt!=''])][not(.//*[local-name()='title'])]`,
      /** "#", empty and javascript: links. */
      deadLinks: `.//a[not(@href) or @href='' or @href='#' or starts-with(@href, 'javascript:')]`,
      /** New-tab links that are missing rel=noopener/noreferrer (tab-nabbing). */
      unsafeBlankLinks: `.//a[@target='_blank'][not(contains(@rel, 'noopener')) and not(contains(@rel, 'noreferrer'))]`,
      /** Link list items: the Nth item of each list (position predicate). */
      nthListItemLinks: (n: number) => `.//ul/li[${n}]/a[@href]`,
      /** Last link of the footer (last() function). */
      lastLink: `(.//a[@href])[last()]`,
      backToTop: `.//*[(self::a or self::button) and (contains(${lower('normalize-space()')}, 'top') or contains(${lower('@aria-label')}, 'top'))]`,
    },
  },

  generic: {
    main: `//main`,
    visibleH1: `//h1[not(${hasClass('sr-only')})]`,
    anyH1: `//h1`,
    imagesWithoutAlt: `//img[not(@alt)]`,
    externalBlankLinks: `//a[starts-with(@href, 'http') and @target='_blank']`,
  },
} as const;

/** Playwright helper: `xp(page, X.header.menuBtn).click()` */
export const xp = (scope: Page | Locator, xpath: string): Locator => scope.locator(`xpath=${xpath}`);

/** Same as xp() but only matches elements that are currently visible (first one). */
export const xpVisible = (scope: Page | Locator, xpath: string): Locator =>
  scope.locator(`xpath=${xpath}`).filter({ visible: true }).first();
