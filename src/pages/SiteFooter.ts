import { Page, Locator } from '@playwright/test';
import { X, xp, SocialNetwork } from '../locators/xpath';
import { collectLinks, LinkInfo } from '../utils/linkUtils';
import { cleanText, scrollTo } from '../utils/elementUtils';

/**
 * Footer page object. The root is found with an absolute XPath; everything else uses the
 * relative XPaths in X.footer.rel, resolved inside the root — so a link called "Forms" in
 * the page body can never be mistaken for the footer one.
 */
export class SiteFooter {
  static readonly socialNetworks: SocialNetwork[] = ['youtube', 'x', 'instagram', 'facebook', 'linkedin'];

  readonly root: Locator;
  readonly links: Locator;
  readonly quickLinksHeading: Locator;
  readonly needHelpHeading: Locator;
  readonly socialLinks: Locator;
  readonly copyright: Locator;
  readonly lastUpdated: Locator;
  readonly logo: Locator;

  constructor(readonly page: Page) {
    this.root = xp(page, X.footer.root);
    this.links = this.rel('.//a[@href]');
    this.quickLinksHeading = this.rel(X.footer.rel.quickLinksHeading).first();
    this.needHelpHeading = this.rel(X.footer.rel.needHelpHeading).first();
    this.socialLinks = this.rel(X.footer.rel.socialLinks);
    this.copyright = this.rel(X.footer.rel.copyright).first();
    this.lastUpdated = this.rel(X.footer.rel.lastUpdated).first();
    this.logo = this.rel(X.footer.rel.logo);
  }

  /** Resolves a relative XPath (starting with ".") inside the footer. */
  rel(relativeXpath: string): Locator {
    return xp(this.root, relativeXpath);
  }

  heading(title: string): Locator {
    return this.rel(X.footer.rel.heading(title)).first();
  }
  section(title: string): Locator {
    return this.rel(X.footer.rel.section(title));
  }
  sectionLinks(title: string): Locator {
    return this.rel(X.footer.rel.sectionLinks(title));
  }
  link(label: string): Locator {
    return this.rel(X.footer.rel.linkByText(label)).first();
  }
  social(network: SocialNetwork): Locator {
    return this.rel(X.footer.rel.social(network)).first();
  }

  async scrollIntoView() {
    await scrollTo(this.root);
  }

  /** Every footer link with text/href/target/rel/size, in one round trip. */
  async linkInfo(scope: Locator = this.links): Promise<LinkInfo[]> {
    return collectLinks(scope);
  }

  async copyrightText() {
    return cleanText(this.copyright);
  }

  /** Four-digit years found in the copyright line, e.g. "© 2024-2026" → [2024, 2026]. */
  async copyrightYears(): Promise<number[]> {
    return ((await this.copyrightText()).match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  }
}
